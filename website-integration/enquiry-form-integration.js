/**
 * RJ Holidays — Enquiry Form Integration Snippet
 *
 * WHAT THIS DOES
 * Wires your existing static enquiry form to the new backend so submissions
 * actually create a Lead ID, notify you by email, and confirm to the customer —
 * none of which happens today since the site has no backend at all.
 *
 * HOW TO USE
 * 1. Replace API_BASE below with your deployed Render backend URL.
 * 2. Give your enquiry <form> the id "rjEnquiryForm" (or change FORM_ID below to match).
 * 3. Make sure each field has a "name" attribute matching what's listed below.
 * 4. Add <script src="enquiry-form-integration.js"></script> before </body> on every
 *    page that has the enquiry form.
 *
 * REQUIRED field names: name, mobile, destination
 * OPTIONAL field names: whatsapp, email, travel_date, return_date, adults, children,
 *                        budget, hotel_category, meal_preference, vehicle_requirement,
 *                        flight_requirement (checkbox), special_requirements
 *
 * This also auto-captures UTM parameters (utm_source, utm_medium, utm_campaign,
 * utm_content, utm_term) from the URL, plus the referrer and landing page —
 * so when you start running ads later, source tracking already works with no changes needed.
 */

(function () {
  const API_BASE = 'https://YOUR-BACKEND.onrender.com'; // <-- set this after deploying to Render
  const FORM_ID = 'rjEnquiryForm';

  function getUtmParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      utm_source: params.get('utm_source') || '',
      utm_medium: params.get('utm_medium') || '',
      utm_campaign: params.get('utm_campaign') || '',
      utm_content: params.get('utm_content') || '',
      utm_term: params.get('utm_term') || '',
      referrer_url: document.referrer || '',
      landing_page: window.location.href,
    };
  }

  function initEnquiryForm() {
    const form = document.getElementById(FORM_ID);
    if (!form) return; // form not on this page, do nothing

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      const submitBtn = form.querySelector('[type="submit"]');
      const originalBtnText = submitBtn ? submitBtn.textContent : '';
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Submitting…'; }

      const fd = new FormData(form);
      const payload = {
        name: fd.get('name'),
        mobile: fd.get('mobile'),
        whatsapp: fd.get('whatsapp') || fd.get('mobile'),
        email: fd.get('email') || '',
        destination: fd.get('destination'),
        travel_date: fd.get('travel_date') || null,
        return_date: fd.get('return_date') || null,
        adults: Number(fd.get('adults')) || 1,
        children: Number(fd.get('children')) || 0,
        budget: fd.get('budget') || '',
        hotel_category: fd.get('hotel_category') || '',
        meal_preference: fd.get('meal_preference') || '',
        vehicle_requirement: fd.get('vehicle_requirement') || '',
        flight_requirement: fd.get('flight_requirement') === 'on',
        special_requirements: fd.get('special_requirements') || '',
        ...getUtmParams(),
      };

      try {
        const res = await fetch(`${API_BASE}/api/enquiries`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || 'Something went wrong');

        // Replace this with whatever confirmation UI fits your site's design —
        // a modal, a redirect to a thank-you page, or simply this alert.
        alert(`Thank you! Your enquiry has been received.\nReference ID: ${data.enquiry_code}\nWe'll be in touch shortly.`);
        form.reset();
      } catch (err) {
        alert('Sorry, something went wrong submitting your enquiry. Please try again or contact us directly on WhatsApp.');
        console.error('[enquiry form]', err);
      } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalBtnText; }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEnquiryForm);
  } else {
    initEnquiryForm();
  }
})();

// Generic branded PDF generator.
// Built once here for Quotations (Phase 7); the same generateDocumentPdf() function
// will be reused for Invoices, Vouchers, and Receipts in Phase 16 — just with different
// `sections` content, so nothing here needs to be rebuilt later.

const PDFDocument = require('pdfkit');

const BRAND_COLOR = '#0f4c5c'; // deep teal — adjust to match actual RJ Holidays brand colors
const ACCENT_COLOR = '#e8871e';

function generateDocumentPdf({ title, docCode, subtitle, sections, footerNote }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc
      .fillColor(BRAND_COLOR)
      .fontSize(22)
      .font('Helvetica-Bold')
      .text('RJ HOLIDAYS', { continued: false });
    doc
      .fillColor('#555')
      .fontSize(10)
      .font('Helvetica')
      .text('rjholidays.online', { continued: false });

    doc.moveDown(1);
    doc
      .fillColor('#000')
      .fontSize(16)
      .font('Helvetica-Bold')
      .text(title);
    if (docCode) {
      doc.fillColor(ACCENT_COLOR).fontSize(11).font('Helvetica-Bold').text(docCode);
    }
    if (subtitle) {
      doc.fillColor('#555').fontSize(10).font('Helvetica').text(subtitle);
    }

    doc.moveDown(1);
    doc.strokeColor('#ddd').lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    // Sections: [{ heading, rows: [[label, value]] } | { heading, text }]
    sections.forEach((section) => {
      doc.fillColor(BRAND_COLOR).fontSize(12).font('Helvetica-Bold').text(section.heading);
      doc.moveDown(0.3);

      if (section.rows) {
        section.rows.forEach(([label, value]) => {
          doc
            .fillColor('#333')
            .fontSize(10)
            .font('Helvetica-Bold')
            .text(`${label}: `, { continued: true })
            .font('Helvetica')
            .text(`${value ?? '-'}`);
        });
      }
      if (section.text) {
        doc.fillColor('#333').fontSize(10).font('Helvetica').text(section.text, { align: 'left' });
      }
      if (section.itinerary) {
        section.itinerary.forEach((day) => {
          doc
            .fillColor('#333')
            .fontSize(10)
            .font('Helvetica-Bold')
            .text(`Day ${day.day}: ${day.title || ''}`);
          if (day.description) {
            doc.font('Helvetica').text(day.description);
          }
          doc.moveDown(0.2);
        });
      }
      doc.moveDown(0.8);
    });

    if (footerNote) {
      doc.moveDown(1);
      doc.strokeColor('#ddd').lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.5);
      doc.fillColor('#888').fontSize(8).font('Helvetica').text(footerNote);
    }

    doc.end();
  });
}

function buildQuotePdf(quote, customer, pkg) {
  const sections = [
    {
      heading: 'Customer & Trip Details',
      rows: [
        ['Customer', customer.name],
        ['Destination', pkg?.destination || quote.package_id],
        ['Travel Date', quote.travel_date],
        ['Return Date', quote.return_date],
        ['Travellers', `${quote.adults} adults, ${quote.children} children`],
        ['Hotel Category', quote.hotel_category || '-'],
        ['Vehicle', quote.vehicle_type || '-'],
      ],
    },
  ];

  if (quote.itinerary && quote.itinerary.length > 0) {
    sections.push({ heading: 'Day-wise Itinerary', itinerary: quote.itinerary });
  }

  if (quote.inclusions) sections.push({ heading: 'Inclusions', text: quote.inclusions });
  if (quote.exclusions) sections.push({ heading: 'Exclusions', text: quote.exclusions });

  sections.push({
    heading: 'Pricing',
    rows: [
      ['Base Rate (per person)', `Rs. ${quote.base_rate_per_person}`],
      ['Season', quote.season_label || 'Standard'],
      ['Vehicle Cost', `Rs. ${quote.vehicle_cost || 0}`],
      ['Hotel Adjustment', `Rs. ${quote.hotel_adjustment || 0}`],
      ['Room Config Adjustment', `Rs. ${quote.room_config_adjustment || 0}`],
      ['Add-ons', (quote.addons || []).map((a) => `${a.name} (Rs. ${a.price})`).join(', ') || 'None'],
      ['Discount', `Rs. ${quote.discount_amount || 0}`],
      ['Total Amount', `Rs. ${quote.total_amount}`],
      ['Advance', `Rs. ${quote.advance_amount}`],
      ['Balance', `Rs. ${quote.balance_amount}`],
      ['Valid Until', quote.validity_date || '-'],
    ],
  });

  if (quote.cancellation_policy) {
    sections.push({ heading: 'Cancellation Policy', text: quote.cancellation_policy });
  }
  if (quote.terms_and_conditions) {
    sections.push({ heading: 'Terms & Conditions', text: quote.terms_and_conditions });
  }

  return generateDocumentPdf({
    title: 'Travel Quotation',
    docCode: quote.quote_code,
    subtitle: `Issued ${new Date(quote.created_at).toLocaleDateString('en-IN')}`,
    sections,
    footerNote: 'This is a system-generated quotation from RJ Holidays. Prices are valid until the date stated above.',
  });
}

// ---- Phase 16 document recipes — all reuse generateDocumentPdf() from Phase 7 ----

function buildInvoicePdf(booking, customer) {
  return generateDocumentPdf({
    title: 'Invoice',
    docCode: booking.booking_code,
    subtitle: `Issued ${new Date().toLocaleDateString('en-IN')}`,
    sections: [
      {
        heading: 'Billed To',
        rows: [
          ['Customer', customer.name],
          ['Phone', customer.phone],
          ['Email', customer.email || '-'],
        ],
      },
      {
        heading: 'Trip Details',
        rows: [
          ['Travel Date', booking.travel_date],
          ['Return Date', booking.return_date],
          ['Travellers', booking.travellers_count],
        ],
      },
      {
        heading: 'Amount',
        rows: [
          ['Total Amount', `Rs. ${booking.total_amount}`],
          ['Paid', `Rs. ${booking.advance_paid}`],
          ['Balance Due', `Rs. ${booking.balance_due}`],
          ['Payment Status', booking.payment_status],
        ],
      },
    ],
    footerNote: 'This is a system-generated invoice from RJ Holidays.',
  });
}

function buildReceiptPdf(payment, booking, customer) {
  return generateDocumentPdf({
    title: 'Payment Receipt',
    docCode: `Receipt for ${booking.booking_code}`,
    subtitle: `Received ${new Date(payment.created_at).toLocaleDateString('en-IN')}`,
    sections: [
      {
        heading: 'Payment Details',
        rows: [
          ['Customer', customer.name],
          ['Amount Received', `Rs. ${payment.amount}`],
          ['Method', payment.payment_method],
          ['Reference', payment.reference_note || payment.razorpay_payment_id || '-'],
        ],
      },
      {
        heading: 'Booking Summary',
        rows: [
          ['Total Amount', `Rs. ${booking.total_amount}`],
          ['Paid to Date', `Rs. ${booking.advance_paid}`],
          ['Balance Remaining', `Rs. ${booking.balance_due}`],
        ],
      },
    ],
    footerNote: 'This is a system-generated receipt from RJ Holidays.',
  });
}

function buildVoucherPdf(booking, customer, type) {
  const vendor = booking.vendor_details || {};
  const sections = [
    {
      heading: 'Guest Details',
      rows: [
        ['Guest Name', customer.name],
        ['Travel Date', booking.travel_date],
        ['Return Date', booking.return_date],
        ['Travellers', booking.travellers_count],
      ],
    },
  ];

  if (type === 'hotel') {
    sections.push({
      heading: 'Hotel Details',
      rows: [
        ['Hotel Name', vendor.hotel_name || '-'],
        ['Confirmation Number', vendor.hotel_confirmation_number || '-'],
        ['Check-in', vendor.check_in || '-'],
        ['Check-out', vendor.check_out || '-'],
      ],
    });
  } else {
    sections.push({
      heading: 'Cab Details',
      rows: [
        ['Vehicle Number', vendor.vehicle_number || '-'],
        ['Driver Name', vendor.driver_name || '-'],
        ['Driver Contact', vendor.driver_contact || '-'],
      ],
    });
  }

  return generateDocumentPdf({
    title: type === 'hotel' ? 'Hotel Voucher' : 'Cab Voucher',
    docCode: booking.booking_code,
    sections,
    footerNote: 'Please present this voucher at check-in / pickup.',
  });
}

function buildBookingConfirmationPdf(booking, customer, itinerary) {
  const sections = [
    {
      heading: 'Booking Summary',
      rows: [
        ['Booking ID', booking.booking_code],
        ['Customer', customer.name],
        ['Travel Date', booking.travel_date],
        ['Return Date', booking.return_date],
        ['Travellers', booking.travellers_count],
        ['Total Amount', `Rs. ${booking.total_amount}`],
        ['Payment Status', booking.payment_status],
      ],
    },
  ];
  if (itinerary && itinerary.length) {
    sections.push({ heading: 'Itinerary', itinerary });
  }
  return generateDocumentPdf({
    title: 'Booking Confirmation',
    docCode: booking.booking_code,
    sections,
    footerNote: 'We look forward to hosting your trip. — RJ Holidays',
  });
}

module.exports = {
  generateDocumentPdf,
  buildQuotePdf,
  buildInvoicePdf,
  buildReceiptPdf,
  buildVoucherPdf,
  buildBookingConfirmationPdf,
};

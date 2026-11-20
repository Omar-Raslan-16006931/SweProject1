import PDFDocument from 'pdfkit';

/** FLT-23: downloadable e-ticket (PDF). */
export function renderETicket(view: any, airlines: Map<string, any>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(22).text('E-Ticket', { align: 'left' });
    doc.moveDown(0.3).fontSize(12).fillColor('#444').text(`Booking reference: ${view.reference}`);
    doc.text(`Status: ${view.status}`);
    doc.text(`Trip: ${view.tripType}`);
    doc.moveDown();

    doc.fillColor('#000').fontSize(15).text('Flights');
    for (const s of view.segments) {
      const a = airlines.get(s.airlineId);
      doc.moveDown(0.4).fontSize(12).text(`${s.direction.toUpperCase()}  ${a?.name ?? ''} ${s.flightNumber}  (${s.cabinClass})`);
      doc.fontSize(11).fillColor('#333')
        .text(`Departs ${s.departureAirport}  ${s.departureLocalTime.replace('T', ' ')} (local time)`)
        .text(`Arrives ${s.arrivalAirport}  ${s.arrivalLocalTime.replace('T', ' ')} (local time)`)
        .text(`Baggage: ${s.freeBags} free bag(s), max ${s.maxBagWeightKg} kg each`);
      doc.fillColor('#000');
    }

    doc.moveDown().fontSize(15).text('Passengers');
    view.passengers.forEach((p: any, i: number) => {
      const extra = p.extraBags?.length ? `, ${p.extraBags.length} extra bag(s)` : '';
      doc.fontSize(11).text(`${i + 1}. ${p.fullName} (${p.type})${p.passportNumber ? `, passport ${p.passportNumber}` : ''}${extra}`);
    });

    doc.moveDown().fontSize(15).text('Payment');
    doc.fontSize(11)
      .text(`Fare: ${view.fareTotal.toFixed(2)} ${view.currency}`)
      .text(`Extra baggage: ${view.baggageTotal.toFixed(2)} ${view.currency}`)
      .text(`Total paid: ${view.total.toFixed(2)} ${view.currency}`);

    doc.moveDown(2).fontSize(9).fillColor('#777').text(`Issued ${new Date().toISOString()}. Travel Planning and Booking Platform.`);
    doc.end();
  });
}

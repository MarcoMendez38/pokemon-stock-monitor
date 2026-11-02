async function sendWhatsApp(message) {
  if (process.env.WHATSAPP_ENABLED !== 'true') return { sent: false, reason: 'disabled' };

  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const recipient = process.env.WHATSAPP_RECIPIENT;
  if (!token || !phoneNumberId || !recipient) {
    throw new Error('Faltan WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID o WHATSAPP_RECIPIENT');
  }

  const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: 'text',
      text: { preview_url: true, body: message }
    })
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`WhatsApp respondió ${response.status}: ${body}`);
  }
  return { sent: true };
}

module.exports = { sendWhatsApp };

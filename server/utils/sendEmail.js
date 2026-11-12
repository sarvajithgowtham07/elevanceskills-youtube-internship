export const sendOTPEmail = async (email, otp) => {
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": process.env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { name: "YourTube Security", email: process.env.EMAIL_USER },
      to: [{ email }],
      subject: "YourTube Login Verification Code",
      textContent: `Your YourTube verification code is ${otp}. This code expires in 10 minutes. If you did not attempt to log in, you can ignore this email.`,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Brevo email failed: ${response.status} ${details}`);
  }
};

export const sendSubscriptionReceiptEmail = async (email, name, transaction, invoiceBuffer) => {
  const invoiceName = `${transaction.invoiceNumber}.pdf`;
  const amount = (transaction.amount / 100).toFixed(2);

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": process.env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { name: "YourTube Billing", email: process.env.EMAIL_USER },
      to: [{ email, name: name || email }],
      subject: "YourTube Subscription Payment Receipt",
      textContent: `Hello ${name || "there"}, your YourTube subscription payment was successful. Plan: ${transaction.plan}. Billing cycle: ${transaction.billingCycle}. Amount: INR ${amount}. Invoice number: ${transaction.invoiceNumber}. Subscription expiry: ${transaction.expiryDate?.toLocaleDateString("en-IN") || "N/A"}. Your invoice is attached to this email.`,
      attachment: [
        {
          name: invoiceName,
          content: invoiceBuffer.toString("base64")
        }
      ]
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Brevo receipt email failed: ${response.status} ${details}`);
  }
};

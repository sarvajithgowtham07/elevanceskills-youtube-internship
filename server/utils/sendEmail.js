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
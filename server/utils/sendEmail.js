import nodemailer from "nodemailer";

export const sendOTPEmail = async (email, otp) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: `"YourTube Security" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "YourTube Login Verification Code",
    text: `Your YourTube verification code is ${otp}. This code expires in 10 minutes. If you did not attempt to log in, you can ignore this email.`,
  });
};
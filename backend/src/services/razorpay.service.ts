import dotenv from "dotenv";

dotenv.config();

// Use require for CommonJS compatibility with Razorpay types
const Razorpay = require("razorpay");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "",
});

export const createRazorpayOrder = async (amountInPaise: number, receipt: string) => {
  const options = {
    amount: amountInPaise,
    currency: "INR",
    receipt: receipt,
  };

  try {
    const order = await razorpay.orders.create(options);
    return order;
  } catch (error) {
    console.error("Error creating Razorpay order:", error);
    throw new Error("Failed to create payment order");
  }
};
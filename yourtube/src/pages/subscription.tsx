
import { useEffect, useState } from "react";
import axiosInstance from "@/lib/axiosinstance";
import { toast } from "sonner";

type PlanName = "Free" | "Bronze" | "Silver" | "Gold";
type BillingCycle = "monthly" | "quarterly" | "yearly";

type SubscriptionData = {
  plan: PlanName;
  status: string;
  billingCycle: BillingCycle;
  startDate: string | null;
  endDate: string | null;
  autoRenew: boolean;
};

type Transaction = {
  _id: string;
  plan: string;
  billingCycle: string;
  paymentId: string | null;
  orderId: string;
  invoiceNumber?: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
};

type RazorpayResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayFailure = {
  error?: {
    metadata?: {
      order_id?: string;
    };
  };
};

type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: RazorpayResponse) => void | Promise<void>;
  modal: {
    ondismiss: () => void;
  };
  theme: {
    color: string;
  };
};

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => {
      open: () => void;
      on: (event: string, callback: (response: RazorpayFailure) => void) => void;
    };
  }
}

const plans = [
  {
    name: "Free",
    description: "Get started with basic video streaming",
    features: ["Limited video access", "Standard quality", "Limited watch time", "Limited downloads"],
    prices: { monthly: 0, quarterly: 0, yearly: 0 }
  },
  {
    name: "Bronze",
    description: "Enjoy more entertainment",
    features: ["Unlimited videos", "HD streaming", "Offline downloads", "Ad-free viewing"],
    prices: { monthly: 99, quarterly: 249, yearly: 899 }
  },
  {
    name: "Silver",
    description: "A better viewing experience",
    features: ["Everything in Bronze", "Higher streaming quality", "Priority content", "Premium courses", "Increased daily usage"],
    prices: { monthly: 199, quarterly: 499, yearly: 1799 }
  },
  {
    name: "Gold",
    description: "The ultimate premium experience",
    features: ["Everything in Silver", "Maximum streaming quality", "Faster streaming", "Exclusive premium content", "Maximum daily usage"],
    prices: { monthly: 299, quarterly: 749, yearly: 2699 }
  }
];

const formatDate = (date: string | null) => {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
};

const loadRazorpayScript = () =>
  new Promise<boolean>((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

export default function SubscriptionPage() {
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [billingHistory, setBillingHistory] = useState<Transaction[]>([]);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [downloadingInvoice, setDownloadingInvoice] = useState<string | null>(null);

  const loadSubscription = async () => {
    try {
      const response = await axiosInstance.get("/subscription/me");
      setSubscription(response.data.subscription);
      setBillingHistory(response.data.billingHistory || []);
    } catch {
      toast.error("Unable to load subscription details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubscription();
  }, []);

  const updatePaymentStatus = async (orderId: string, status: "failed" | "cancelled") => {
    try {
      await axiosInstance.post("/payment/status", { orderId, status });
    } catch {
      toast.error("Unable to record payment status");
    }
  };

  const downloadInvoice = async (transaction: Transaction) => {
    if (downloadingInvoice) return;

    setDownloadingInvoice(transaction._id);

    try {
      const response = await axiosInstance.get(
        `/payment/invoice/${transaction._id}`,
        { responseType: "blob" }
      );

      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = `${transaction.invoiceNumber || "subscription-invoice"}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success("Invoice downloaded successfully");
    } catch {
      toast.error("Unable to download invoice");
    } finally {
      setDownloadingInvoice(null);
    }
  };

  const handlePayment = async (plan: string) => {
    if (processing) return;

    setProcessing(true);

    let orderId = "";

    try {
      const scriptLoaded = await loadRazorpayScript();

      if (!scriptLoaded) {
        toast.error("Unable to load Razorpay Checkout");
        return;
      }

      const orderResponse = await axiosInstance.post("/payment/create-order", {
        plan,
        billingCycle
      });

      const order = orderResponse.data;
      orderId = order.orderId;

      const options: RazorpayOptions = {
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "Your-Tube",
        description: `${plan} Subscription - ${billingCycle}`,
        order_id: order.orderId,
        handler: async (paymentResponse) => {
          try {
            const verificationResponse = await axiosInstance.post("/payment/verify", {
              razorpay_order_id: paymentResponse.razorpay_order_id,
              razorpay_payment_id: paymentResponse.razorpay_payment_id,
              razorpay_signature: paymentResponse.razorpay_signature
            });

            if (verificationResponse.status === 200) {
              toast.success("Payment successful! Subscription activated.");
              await loadSubscription();
            }
          } catch {
            toast.error("Payment verification failed. Contact support before retrying.");
          } finally {
            setProcessing(false);
          }
        },
        modal: {
          ondismiss: () => {
            void updatePaymentStatus(orderId, "cancelled");
            toast.info("Payment cancelled");
            setProcessing(false);
          }
        },
        theme: {
          color: "#171717"
        }
      };

      const razorpay = new window.Razorpay(options);

      razorpay.on("payment.failed", (response) => {
        const failedOrderId = response.error?.metadata?.order_id || orderId;

        if (failedOrderId) {
          void updatePaymentStatus(failedOrderId, "failed");
        }

        toast.error("Payment failed. Please try again.");
        setProcessing(false);
      });

      razorpay.open();
    } catch (error) {
      toast.error("Unable to initiate payment");

      if (orderId) {
        await updatePaymentStatus(orderId, "failed");
      }

      setProcessing(false);
    }
  };

  if (loading) {
    return <div className="w-full p-8 text-center">Loading subscription details...</div>;
  }

  if (!subscription) {
    return <div className="w-full p-8 text-center">Unable to load subscription details.</div>;
  }

  return (
    <main className="w-full min-h-screen p-4 md:p-8 space-y-8">
      <section>
        <h1 className="text-3xl font-bold">Subscription Plans</h1>
        <p className="mt-2 text-muted-foreground">
          Choose a plan that fits your viewing experience.
        </p>
      </section>

      <section className="rounded-xl border p-6 space-y-3">
        <h2 className="text-xl font-semibold">Your Current Subscription</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-sm text-muted-foreground">Current Plan</p>
            <p className="text-lg font-semibold">{subscription.plan}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Status</p>
            <p className="text-lg font-semibold capitalize">{subscription.status}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Start Date</p>
            <p className="text-lg font-semibold">{formatDate(subscription.startDate)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Expiry Date</p>
            <p className="text-lg font-semibold">{formatDate(subscription.endDate)}</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Auto-renewal: {subscription.autoRenew ? "Enabled" : "Disabled"}
        </p>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold">Choose Your Plan</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Select a billing period to compare prices.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {(["monthly", "quarterly", "yearly"] as BillingCycle[]).map((cycle) => (
            <button
              key={cycle}
              onClick={() => setBillingCycle(cycle)}
              disabled={processing}
              className={`rounded-lg border px-4 py-2 capitalize ${
                billingCycle === cycle
                  ? "bg-primary text-primary-foreground"
                  : "bg-background"
              }`}
            >
              {cycle}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => {
            const isCurrent = subscription.plan === plan.name;

            return (
              <div
                key={plan.name}
                className={`rounded-xl border p-5 flex flex-col gap-4 ${
                  isCurrent ? "border-primary ring-1 ring-primary" : ""
                }`}
              >
                <div>
                  <h3 className="text-xl font-bold">{plan.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {plan.description}
                  </p>
                </div>

                <div>
                  <span className="text-3xl font-bold">
                    ₹{plan.prices[billingCycle].toLocaleString("en-IN")}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    /{billingCycle}
                  </span>
                </div>

                <ul className="flex-1 space-y-2 text-sm">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <span className="text-green-600">✓</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  disabled={isCurrent || plan.name === "Free" || processing}
                  onClick={() => handlePayment(plan.name)}
                  className="w-full rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isCurrent
                    ? "Current Plan"
                    : plan.name === "Free"
                    ? "Free Plan"
                    : processing
                    ? "Processing..."
                    : "Choose Plan"}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Billing History</h2>

        {billingHistory.length === 0 ? (
          <p className="rounded-xl border p-6 text-center text-muted-foreground">
            No billing transactions found.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3">Plan</th>
                  <th className="p-3">Billing</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Invoice</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {billingHistory.map((transaction) => (
                  <tr key={transaction._id} className="border-t">
                    <td className="p-3">{formatDate(transaction.createdAt)}</td>
                    <td className="p-3">{transaction.plan}</td>
                    <td className="p-3 capitalize">{transaction.billingCycle}</td>
                    <td className="p-3">
                      ₹{(transaction.amount / 100).toLocaleString("en-IN")}
                    </td>
                    <td className="p-3">{transaction.invoiceNumber || "—"}</td>
                    <td className="p-3 capitalize">{transaction.status}</td>
                    <td className="p-3">
                      {transaction.status === "paid" && transaction.invoiceNumber ? (
                        <button
                          type="button"
                          onClick={() => downloadInvoice(transaction)}
                          disabled={downloadingInvoice !== null}
                          className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {downloadingInvoice === transaction._id ? "Downloading..." : "Download"}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

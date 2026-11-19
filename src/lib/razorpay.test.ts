import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getRazorpayConfig, verifyPaymentSignature, verifyWebhookSignature } from "./razorpay";

const SECRET = "test_secret_value";

describe("razorpay signatures", () => {
  it("accepts a valid checkout signature and rejects tampering", () => {
    const sig = createHmac("sha256", SECRET).update("order_ABC123456|pay_XYZ123456").digest("hex");
    expect(verifyPaymentSignature(SECRET, "order_ABC123456", "pay_XYZ123456", sig)).toBe(true);
    expect(verifyPaymentSignature(SECRET, "order_ABC123456", "pay_OTHER12345", sig)).toBe(false);
    expect(verifyPaymentSignature("wrong", "order_ABC123456", "pay_XYZ123456", sig)).toBe(false);
    expect(verifyPaymentSignature(SECRET, "order_ABC123456", "pay_XYZ123456", "not-hex")).toBe(false);
    expect(verifyPaymentSignature(SECRET, "order_ABC123456", "pay_XYZ123456", sig.slice(0, 10))).toBe(false);
  });

  it("verifies webhook bodies byte for byte", () => {
    const body = JSON.stringify({ event: "payment.captured", payload: {} });
    const sig = createHmac("sha256", SECRET).update(body).digest("hex");
    expect(verifyWebhookSignature(SECRET, body, sig)).toBe(true);
    expect(verifyWebhookSignature(SECRET, body + " ", sig)).toBe(false);
  });
});

describe("razorpay config", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("enables test keys and refuses live keys unless explicitly allowed", () => {
    vi.stubEnv("RAZORPAY_KEY_SECRET", "s");
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_abc");
    expect(getRazorpayConfig()?.mode).toBe("test");
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_live_abc");
    expect(getRazorpayConfig()).toBeNull();
    vi.stubEnv("RAZORPAY_ALLOW_LIVE", "true");
    expect(getRazorpayConfig()?.mode).toBe("live");
  });

  it("is disabled without a secret or with an unknown key", () => {
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_abc");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "");
    expect(getRazorpayConfig()).toBeNull();
    vi.stubEnv("RAZORPAY_KEY_SECRET", "s");
    vi.stubEnv("RAZORPAY_KEY_ID", "abc");
    expect(getRazorpayConfig()).toBeNull();
  });
});

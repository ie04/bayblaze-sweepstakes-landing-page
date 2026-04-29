import { useEffect, useState } from "react";

function ReferralStep({ email, onNoThanks, onDone, onGeneratedChange }) {
  const [loading, setLoading] = useState(false);
  const [referralLink, setReferralLink] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);

  const GENERATE_REFERRAL_LINK_URL =
    "https://us-central1-bayblaze-sweepstakes.cloudfunctions.net/generateReferralLink";

  useEffect(() => {
    onGeneratedChange(Boolean(referralLink));
  }, [onGeneratedChange, referralLink]);

  const handleGenerateLink = async () => {
    setLoading(true);
    setMessage("");
    setErrorMessage("");
    setLinkCopied(false);

    try {
      const response = await fetch(GENERATE_REFERRAL_LINK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not generate referral link.");
      }

      setReferralLink(data.referralLink);
      setQrDataUrl(data.qrDataUrl);
      setMessage(`Referral link and QR code sent to ${email}.`);
    } catch (error) {
      setErrorMessage(error.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(referralLink);
    setLinkCopied(true);
    setMessage("Referral link copied.");
  };

  return (
    <div className="mt-6 flex flex-col gap-6">
      {!referralLink && (
        <div className="flex gap-4">
          <button
            type="button"
            onClick={onNoThanks}
            className="flex-1 rounded-xl border border-[#d8cbbd] bg-[#fffaf4] px-4 py-3 font-semibold text-[#5c5248] transition hover:bg-[#eadfce]"
          >
            No Thanks
          </button>

          <button
            type="button"
            onClick={handleGenerateLink}
            disabled={loading}
            className="flex-1 rounded-xl bg-[#2f6b3f] px-4 py-3 font-semibold text-[#f3eadf] transition hover:bg-[#4d9b5f] disabled:opacity-60"
          >
            {loading ? "Generating..." : "Generate Link"}
          </button>
        </div>
      )}

      {referralLink && (
        <div className="flex flex-col gap-4">
          <input
            readOnly
            value={referralLink}
            className="w-full rounded-xl border border-[#d8cbbd] bg-[#fffaf4] px-4 py-3 text-sm text-[#018548]"
          />

          <button
            type="button"
            onClick={handleCopyLink}
            className={
              linkCopied ?
                "rounded-xl border border-[#d8cbbd] bg-[#fffaf4] px-4 py-3 font-semibold text-[#5c5248] transition hover:bg-[#eadfce]" :
                "rounded-xl bg-[#018548] px-4 py-3 font-semibold text-[#f3eadf] transition hover:bg-[#2f6b3f]"
            }
          >
            {linkCopied ? "Copied!" : "Copy Link"}
          </button>

          {qrDataUrl && (
            <img
              src={qrDataUrl}
              alt="Referral QR code"
              className="mx-auto block w-64"
            />
          )}

          <button
            type="button"
            onClick={onDone}
            className="w-full rounded-xl bg-[#018548] px-4 py-3 font-semibold text-[#f3eadf] transition hover:bg-[#2f6b3f]"
          >
            Done
          </button>
        </div>
      )}

      {message && <p className="text-sm text-[#2f6b3f]">{message}</p>}
      {errorMessage && <p className="text-sm text-red-700">{errorMessage}</p>}
    </div>
  );
}

export default ReferralStep;

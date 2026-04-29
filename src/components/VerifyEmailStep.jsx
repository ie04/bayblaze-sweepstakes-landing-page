function VerifyEmailStep({
  email,
  code,
  setCode,
  loading,
  onSubmit,
  onBack,
}) {
  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
      <p className="text-sm text-[#5c5248]">
        We sent a verification code to{" "}
        <span className="font-semibold">{email}</span>.
      </p>

      <input
        type="text"
        inputMode="numeric"
        maxLength="6"
        placeholder="Enter 6-digit code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        required
        className="
          w-full rounded-xl border border-[#d8cbbd]
          bg-[#fffaf4] px-4 py-3 text-center
          text-2xl tracking-normal text-[#111111]
          placeholder-[#8a7d70]
          focus:outline-none focus:ring-2 focus:ring-[#4d9b5f]
        "
      />

      <button
        type="submit"
        disabled={loading}
        className="
          w-full rounded-xl bg-[#2f6b3f]
          px-4 py-3 font-semibold text-[#f3eadf]
          hover:bg-[#4d9b5f] transition disabled:opacity-60
        "
      >
        {loading ? "Verifying..." : "Verify & Continue to Survey"}
      </button>

      <button
        type="button"
        onClick={onBack}
        className="text-sm text-[#2f6b3f] underline"
      >
        Use a different email
      </button>
    </form>
  );
}

export default VerifyEmailStep;

function EmailStep({
  email,
  setEmail,
  loading,
  onSubmit,
}) {
  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
      <input
        type="email"
        placeholder="Enter your email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        className="
          w-full rounded-xl border border-[#d8cbbd]
          bg-[#fffaf4] px-4 py-3 text-[#111111]
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
        {loading ? "Sending Code..." : "Continue"}
      </button>
    </form>
  );
}

export default EmailStep;
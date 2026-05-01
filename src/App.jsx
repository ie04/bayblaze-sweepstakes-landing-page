import { lazy, Suspense, useState } from "react";
import "./App.css";
import bayblazeBackground from "../functions/assets/bayblaze-background.png";
import EmailStep from "./components/EmailStep";
import VerifyEmailStep from "./components/VerifyEmailStep";
import SurveyStep from "./components/SurveyStep";
import ReferralStep from "./components/ReferralStep";
import ThankYouStep from "./components/ThankYouStep";

const Dashboard = lazy(() => import("./components/Dashboard"));

function App() {
  const isDashboardRoute =
    window.location.pathname.replace(/\/+$/, "") === "/dashboard";
  const [screen, setScreen] = useState("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [referralGenerated, setReferralGenerated] = useState(false);
  const [referralCode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("ref")?.trim() || "";
  });

  const START_EMAIL_VERIFICATION_URL =
    "https://us-central1-bayblaze-sweepstakes.cloudfunctions.net/startEmailVerification";

  const VERIFY_EMAIL_CODE_URL =
    "https://us-central1-bayblaze-sweepstakes.cloudfunctions.net/verifyEmailCode";
  const UPDATE_SWEEPSTAKES_URL =
    "https://us-central1-bayblaze-sweepstakes.cloudfunctions.net/updateSweepstakesFromForm";
  const normalizeEmail = (value) => value.trim().toLowerCase();

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");

    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      setErrorMessage("Please enter your email.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(START_EMAIL_VERIFICATION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: normalizedEmail,
          referralCode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not send verification code.");
      }

      setEmail(normalizedEmail);

      if (data.status === "already_verified") {
        setReferralGenerated(false);
        setScreen("survey");
        return;
      }

      setScreen("verify");
    } catch (error) {
      setErrorMessage(error.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleCodeSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");

    const normalizedEmail = normalizeEmail(email);
    const trimmedCode = code.trim();

    if (!trimmedCode) {
      setErrorMessage("Please enter your verification code.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(VERIFY_EMAIL_CODE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: normalizedEmail,
          code: trimmedCode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Verification failed.");
      }

      setEmail(normalizedEmail);
      setReferralGenerated(false);
      setScreen("survey");
    } catch (error) {
      setErrorMessage(error.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleBackToEmail = () => {
    setCode("");
    setErrorMessage("");
    setReferralGenerated(false);
    setScreen("email");
  };

  const handleNoThanks = () => {
    setErrorMessage("");
    setReferralGenerated(false);
    setScreen("thankyou");
  };

  const handleDone = () => {
    setErrorMessage("");
    setReferralGenerated(false);
    setScreen("thankyou");
  };

  const handleSurveySubmit = async (surveyData) => {
    setErrorMessage("");
    setLoading(true);

    try {
      const response = await fetch(UPDATE_SWEEPSTAKES_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: normalizeEmail(email),
          ...surveyData,
        }),
      });

      const data = await response.text();

      if (!response.ok) {
        throw new Error(data || "Could not submit survey.");
      }

      setReferralGenerated(false);
      setScreen("referral");
    } catch (error) {
      setErrorMessage(error.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const heroSubheading =
    screen === "email" ?
      "Complete our quick 30-second survey to enter for your chance to win. It only takes 30 seconds tops!" :
    screen === "verify" ?
      "Enter the 6-digit code that was just sent to your email to proceed to survey." :
    screen === "survey" ?
      "Complete the survey" :
    screen === "referral" && !referralGenerated ?
      null :
    screen === "referral" && referralGenerated ?
      "Here is your referral link and QR code. Send this out to your friends or post it on your IG story. You'll get 5 additional entries for each friend that fills out the survey with your referral link!" :
    screen === "thankyou" ?
      "Your entry has been received. We appreciate you taking the time to share your feedback with BayBlaze." :
      "";
  const heroTitle =
    screen === "thankyou" ?
      "Thank you for completing the survey!" :
      "Win a FREE $30 Visa Gift Card!";

  if (isDashboardRoute) {
    return (
      <Suspense
        fallback={
          <main
            className="app-shell min-h-screen flex items-center justify-center px-4 py-8"
            style={{"--app-shell-background": `url(${bayblazeBackground})`}}
          >
            <div className="app-card w-full max-w-lg rounded-2xl p-8 text-center">
              <p className="text-lg font-semibold text-[#2f6b3f]">
                Loading dashboard...
              </p>
            </div>
          </main>
        }
      >
        <Dashboard />
      </Suspense>
    );
  }

  return (
    <main
      className="app-shell min-h-screen flex items-center justify-center px-4 py-8"
      style={{"--app-shell-background": `url(${bayblazeBackground})`}}
    >
      <div className="app-card w-full max-w-lg rounded-2xl p-8 text-center">
        <h1 className="text-4xl font-bold !text-[#2f6b3f]">{heroTitle}</h1>

        {screen === "referral" && !referralGenerated ? (
          <div className="referral-subheading mt-3 text-lg font-semibold text-[#5c5248]">
            <p>
              OPTIONAL: Create your own link to send to your friends. You can send this link to up to 5 of your friends.
            </p>
            <div className="referral-subheading-spacer" aria-hidden="true" />
            <p>
              You will earn an extra entry for each friend that follows your link and completes the survey, increasing your odds up to 5x!
            </p>
          </div>
        ) : heroSubheading ? (
          <p className="mt-3 text-lg font-semibold text-[#5c5248]">
            {heroSubheading}
          </p>
        ) : null}

        {screen === "email" && (
          <EmailStep
            email={email}
            setEmail={setEmail}
            loading={loading}
            onSubmit={handleEmailSubmit}
          />
        )}

        {screen === "verify" && (
          <VerifyEmailStep
            email={email}
            code={code}
            setCode={setCode}
            loading={loading}
            onSubmit={handleCodeSubmit}
            onBack={handleBackToEmail}
          />
        )}

        {screen === "survey" && (
          <SurveyStep
            email={normalizeEmail(email)}
            loading={loading}
            onSubmit={handleSurveySubmit}
          />
        )}

        {screen === "referral" && (
          <ReferralStep
            email={email}
            onNoThanks={handleNoThanks}
            onDone={handleDone}
            onGeneratedChange={setReferralGenerated}
          />
        )}

        {screen === "thankyou" && <ThankYouStep />}

        {errorMessage && (
          <p className="mt-4 text-sm text-red-700">{errorMessage}</p>
        )}

        {screen === "email" ? (
          <p className="mt-4 text-xs text-[#8a7d70]">
            No purchase necessary. One entry per person. Additional entries
            available through referrals.
          </p>
        ) : null}
      </div>
    </main>
  );
}

export default App;

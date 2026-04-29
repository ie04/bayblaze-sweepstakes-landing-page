import { useState } from "react";

const VAPE_BRAND_OPTIONS = [
  "Geek Bar",
  "Lost Mary",
  "RAZ",
  "Elf Bar",
  "Other",
];

const VAPE_FLAVOR_OPTIONS = [
  "Blue Razz Ice",
  "Watermelon Ice",
  "Miami Mint",
  "Strawberry Watermelon",
  "Mango",
  "Other",
];

const CIGARETTE_BRAND_OPTIONS = [
  "I dont smoke cigarettes",
  "Marlboro",
  "Newport",
  "Camel",
  "American Spirit",
  "Other",
];

const SMOKE_SHOP_OPTIONS = [
  "Gummies",
  "Glass / pipes",
  "Wraps / blunt wraps",
  "Papers / cones",
  "Lighters / torches",
  "Kratom",
  "Hookah products",
  "Nicotine pouches",
  "Detox / cleaning products",
  "Grinders / accessories",
];

const VAPE_PRIORITY_OPTIONS = [
  "Price",
  "Puff count",
  "Battery life",
  "Flavor options",
];

function SurveyStep({ loading, onSubmit }) {
  const [favoriteVapeBrand, setFavoriteVapeBrand] = useState("");
  const [otherVapeBrand, setOtherVapeBrand] = useState("");
  const [favoriteVapeFlavor, setFavoriteVapeFlavor] = useState("");
  const [otherVapeFlavor, setOtherVapeFlavor] = useState("");
  const [favoriteCigaretteBrand, setFavoriteCigaretteBrand] = useState("");
  const [otherCigaretteBrand, setOtherCigaretteBrand] = useState("");
  const [smokeShopProducts, setSmokeShopProducts] = useState([]);
  const [vapePriority, setVapePriority] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [instagramHandle, setInstagramHandle] = useState("");

  const toggleSmokeShopProduct = (value) => {
    setSmokeShopProducts((currentValues) => {
      if (currentValues.includes(value)) {
        return currentValues.filter((item) => item !== value);
      }

      return [...currentValues, value];
    });
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    onSubmit({
      favoriteVapeBrand:
        favoriteVapeBrand === "Other" ? otherVapeBrand.trim() : favoriteVapeBrand,
      favoriteVapeFlavor:
        favoriteVapeFlavor === "Other" ?
          otherVapeFlavor.trim() :
          favoriteVapeFlavor,
      favoriteCigaretteBrand:
        favoriteCigaretteBrand === "Other" ?
          otherCigaretteBrand.trim() :
          favoriteCigaretteBrand,
      smokeShopProducts,
      vapePriority,
      zipCode,
      instagramHandle,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5 text-left">
      <fieldset className="flex flex-col gap-3">
        <legend className="text-lg font-semibold text-[#2f6b3f]">
          1. What is your favorite vape brand?
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {VAPE_BRAND_OPTIONS.map((option) => (
            <label
              key={option}
              className="flex items-center gap-3 rounded-xl border border-[#d8cbbd] bg-[#fffaf4] px-4 py-3 text-sm font-medium text-[#5c5248]"
            >
              <input
                type="radio"
                name="favoriteVapeBrand"
                value={option}
                checked={favoriteVapeBrand === option}
                onChange={(event) => setFavoriteVapeBrand(event.target.value)}
                required
                className="h-4 w-4 accent-[#2f6b3f]"
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
        {favoriteVapeBrand === "Other" && (
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-[#5c5248]">
              Other brand
            </span>
            <input
              type="text"
              value={otherVapeBrand}
              onChange={(event) => setOtherVapeBrand(event.target.value)}
              required
              className="w-full rounded-xl border border-[#d8cbbd] bg-[#fffaf4] px-4 py-3 text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#4d9b5f]"
            />
          </label>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-lg font-semibold text-[#2f6b3f]">
          2. What is your favorite vape flavor?
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {VAPE_FLAVOR_OPTIONS.map((option) => (
            <label
              key={option}
              className="flex items-center gap-3 rounded-xl border border-[#d8cbbd] bg-[#fffaf4] px-4 py-3 text-sm font-medium text-[#5c5248]"
            >
              <input
                type="radio"
                name="favoriteVapeFlavor"
                value={option}
                checked={favoriteVapeFlavor === option}
                onChange={(event) => setFavoriteVapeFlavor(event.target.value)}
                required
                className="h-4 w-4 accent-[#2f6b3f]"
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
        {favoriteVapeFlavor === "Other" && (
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-[#5c5248]">
              Other flavor
            </span>
            <input
              type="text"
              value={otherVapeFlavor}
              onChange={(event) => setOtherVapeFlavor(event.target.value)}
              required
              className="w-full rounded-xl border border-[#d8cbbd] bg-[#fffaf4] px-4 py-3 text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#4d9b5f]"
            />
          </label>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-lg font-semibold text-[#2f6b3f]">
          3. What is your favorite cigarette brand?
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {CIGARETTE_BRAND_OPTIONS.map((option) => (
            <label
              key={option}
              className="flex items-center gap-3 rounded-xl border border-[#d8cbbd] bg-[#fffaf4] px-4 py-3 text-sm font-medium text-[#5c5248]"
            >
              <input
                type="radio"
                name="favoriteCigaretteBrand"
                value={option}
                checked={favoriteCigaretteBrand === option}
                onChange={(event) =>
                  setFavoriteCigaretteBrand(event.target.value)
                }
                required
                className="h-4 w-4 accent-[#2f6b3f]"
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
        {favoriteCigaretteBrand === "Other" && (
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-[#5c5248]">
              Other brand
            </span>
            <input
              type="text"
              value={otherCigaretteBrand}
              onChange={(event) => setOtherCigaretteBrand(event.target.value)}
              required
              className="w-full rounded-xl border border-[#d8cbbd] bg-[#fffaf4] px-4 py-3 text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#4d9b5f]"
            />
          </label>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-lg font-semibold text-[#2f6b3f]">
          4. What matters most when choosing a vape?
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {VAPE_PRIORITY_OPTIONS.map((option) => (
            <label
              key={option}
              className="flex items-center gap-3 rounded-xl border border-[#d8cbbd] bg-[#fffaf4] px-4 py-3 text-sm font-medium text-[#5c5248]"
            >
              <input
                type="radio"
                name="vapePriority"
                value={option}
                checked={vapePriority === option}
                onChange={(event) => setVapePriority(event.target.value)}
                required
                className="h-4 w-4 accent-[#2f6b3f]"
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-lg font-semibold text-[#2f6b3f]">
          5. What else do you usually buy from smoke shops?
        </legend>
        <p className="text-sm italic text-[#8a7d70]">You can pick multiple!</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {SMOKE_SHOP_OPTIONS.map((option) => (
            <label
              key={option}
              className="flex items-center gap-3 rounded-xl border border-[#d8cbbd] bg-[#fffaf4] px-4 py-3 text-sm font-medium text-[#5c5248]"
            >
              <input
                type="checkbox"
                checked={smokeShopProducts.includes(option)}
                onChange={() => toggleSmokeShopProduct(option)}
                className="h-4 w-4 accent-[#2f6b3f]"
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-2">
        <span className="text-lg font-semibold text-[#2f6b3f]">
          6. What is your zip code?
        </span>
        <input
          type="text"
          inputMode="numeric"
          value={zipCode}
          onChange={(event) => setZipCode(event.target.value)}
          required
          className="w-full rounded-xl border border-[#d8cbbd] bg-[#fffaf4] px-4 py-3 text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#4d9b5f]"
        />
      </label>

      <div className="text-left">
        <span className="text-lg font-semibold text-[#2f6b3f]">
          7. Follow us on IG (you need to be a follower in order to win):{" "}
        </span>
        <a
          href="https://instagram.com/tampabayblaze"
          target="_blank"
          rel="noreferrer"
          className="text-lg font-semibold text-[#4d9b5f] underline"
        >
          @tampabayblaze
        </a>
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-lg font-semibold text-[#2f6b3f]">
          8. Tell us your IG handle so we can DM you if you win
        </span>
        <input
          type="text"
          value={instagramHandle}
          onChange={(event) => setInstagramHandle(event.target.value)}
          required
          className="w-full rounded-xl border border-[#d8cbbd] bg-[#fffaf4] px-4 py-3 text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#4d9b5f]"
        />
      </label>

      <button
        type="submit"
        disabled={loading || smokeShopProducts.length === 0}
        className="w-full rounded-xl bg-[#2f6b3f] px-4 py-3 font-semibold text-[#f3eadf] transition hover:bg-[#4d9b5f] disabled:opacity-60"
      >
        {loading ? "Submitting Survey..." : "Submit Survey"}
      </button>
    </form>
  );
}

export default SurveyStep;

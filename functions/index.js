const {onRequest} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const admin = require("firebase-admin");
const crypto = require("crypto");
const {Resend} = require("resend");
const QRCode = require("qrcode");
const sharp = require("sharp");
const path = require("path");

admin.initializeApp();

const RESEND_API_KEY = defineSecret("RESEND_API_KEY");

const TEST_EMAILS = new Set([
  "iyad@eltifi.com",
]);
const DASHBOARD_ADMIN_EMAILS = new Set([
  "iyad@eltifi.com",
]);
const PENDING_VERIFICATIONS_COLLECTION = "pending_email_verifications";
const QR_DARK_COLOR = "#2f6b3f";
const QR_LIGHT_COLOR = "#f3eadf";
const QR_IMAGE_SIZE = 1200;
const CENTER_LOGO_MAX_SIZE = 360;

function isTestEmail(email) {
  return TEST_EMAILS.has(email.trim().toLowerCase());
}

function normalizeEmail(email) {
    return email.trim().toLowerCase();
}

function generateCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

function hashCode(code) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function hashEmail(email) {
  return crypto.createHash("sha256").update(normalizeEmail(email)).digest("hex");
}

function isDashboardAdmin(decodedToken) {
  const email =
    typeof decodedToken.email === "string" ?
      decodedToken.email.trim().toLowerCase() :
      "";

  return decodedToken.admin === true || DASHBOARD_ADMIN_EMAILS.has(email);
}

function serializeFirestoreValue(value) {
  if (value === null || value === undefined) {
    return value;
  }

  if (
    typeof value.toMillis === "function" &&
    typeof value.seconds === "number"
  ) {
    return {
      seconds: value.seconds,
      nanoseconds: value.nanoseconds,
    };
  }

  if (
    typeof value.path === "string" &&
    typeof value.id === "string" &&
    typeof value.parent === "object"
  ) {
    return {path: value.path};
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeFirestoreValue(item));
  }

  if (typeof value === "object") {
    return Object.entries(value).reduce((serialized, [key, item]) => {
      serialized[key] = serializeFirestoreValue(item);
      return serialized;
    }, {});
  }

  return value;
}

function serializeDocument(doc) {
  return {
    id: doc.id,
    __path: doc.ref.path,
    ...serializeFirestoreValue(doc.data()),
  };
}

function createRoundedRectSvg(width, height, radius, fill) {
  return Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="${fill}"/>
    </svg>
  `);
}

async function buildCenteredLogoBuffer(input, options = {}) {
  const {
    horizontalPadding = 10,
    roundedRadiusRatio = 0,
  } = options;
  const logoMetadata = await sharp(input).metadata();
  const logoAspectWidth = logoMetadata.width || CENTER_LOGO_MAX_SIZE;
  const logoAspectHeight = logoMetadata.height || CENTER_LOGO_MAX_SIZE;
  const logoScale = Math.min(
    CENTER_LOGO_MAX_SIZE / logoAspectWidth,
    CENTER_LOGO_MAX_SIZE / logoAspectHeight
  );
  const logoWidth = Math.round(logoAspectWidth * logoScale);
  const logoHeight = Math.round(logoAspectHeight * logoScale);

  const logoMaskBuffer = await sharp(input)
    .resize(logoWidth, logoHeight, {
      fit: "contain",
      position: "centre",
      background: QR_LIGHT_COLOR,
    })
    .greyscale()
    .threshold(200)
    .negate()
    .png()
    .toBuffer();

  const logoForegroundBuffer = await sharp({
    create: {
      width: logoWidth,
      height: logoHeight,
      channels: 3,
      background: QR_DARK_COLOR,
    },
  })
    .joinChannel(logoMaskBuffer)
    .png()
    .toBuffer();

  const canvasWidth = logoWidth + horizontalPadding * 2;
  const canvasHeight = logoHeight;
  const backgroundBuffer = roundedRadiusRatio > 0 ?
    await sharp(
      createRoundedRectSvg(
        canvasWidth,
        canvasHeight,
        Math.round(Math.min(canvasWidth, canvasHeight) * roundedRadiusRatio),
        QR_LIGHT_COLOR
      )
    )
      .png()
      .toBuffer() :
    await sharp({
      create: {
        width: canvasWidth,
        height: canvasHeight,
        channels: 3,
        background: QR_LIGHT_COLOR,
      },
    })
      .png()
      .toBuffer();

  return sharp(backgroundBuffer)
    .composite([
      {
        input: logoForegroundBuffer,
        left: horizontalPadding,
        top: 0,
      },
    ])
    .png()
    .toBuffer();
}

async function buildStyledQrBuffer(targetUrl, centeredLogoInput, logoOptions = {}) {
  const qrBuffer = await QRCode.toBuffer(targetUrl, {
    errorCorrectionLevel: "H",
    type: "png",
    width: QR_IMAGE_SIZE,
    margin: 0,
    color: {
      dark: QR_DARK_COLOR,
      light: QR_LIGHT_COLOR,
    },
  });

  const logoBuffer = await buildCenteredLogoBuffer(centeredLogoInput, logoOptions);

  return sharp(qrBuffer)
    .composite([
      {
        input: logoBuffer,
        gravity: "center",
      },
    ])
    .png()
    .toBuffer();
}

async function buildDirectLogoBuffer(input, options = {}) {
  const {
    horizontalPadding = 12,
    verticalPadding = 0,
    roundedRadiusRatio = 0,
    maxSize = CENTER_LOGO_MAX_SIZE,
    badgeWidth = null,
    badgeHeight = null,
  } = options;
  const trimmedLogoBuffer = await sharp(input)
    .trim({
      background: "#f8f8f8",
      threshold: 20,
    })
    .png()
    .toBuffer();
  const logoMetadata = await sharp(trimmedLogoBuffer).metadata();
  const logoAspectWidth = logoMetadata.width || maxSize;
  const logoAspectHeight = logoMetadata.height || maxSize;
  const logoScale = Math.min(
    maxSize / logoAspectWidth,
    maxSize / logoAspectHeight
  );
  const logoWidth = Math.round(logoAspectWidth * logoScale);
  const logoHeight = Math.round(logoAspectHeight * logoScale);
  const canvasWidth = badgeWidth || (logoWidth + horizontalPadding * 2);
  const canvasHeight = badgeHeight || (logoHeight + verticalPadding * 2);
  const logoLeft = Math.round((canvasWidth - logoWidth) / 2);
  const logoTop = Math.round((canvasHeight - logoHeight) / 2);

  const roundedRadius = Math.round(
    Math.min(canvasWidth, canvasHeight) * roundedRadiusRatio
  );
  const backgroundBuffer = roundedRadiusRatio > 0 ?
    await sharp(
      createRoundedRectSvg(
        canvasWidth,
        canvasHeight,
        roundedRadius,
        QR_LIGHT_COLOR
      )
    )
      .png()
      .toBuffer() :
    await sharp({
      create: {
        width: canvasWidth,
        height: canvasHeight,
        channels: 3,
        background: QR_LIGHT_COLOR,
      },
    })
      .png()
      .toBuffer();

  const logoMaskBuffer = await sharp(trimmedLogoBuffer)
    .resize(logoWidth, logoHeight, {
      fit: "contain",
      position: "centre",
      background: "#ffffff",
    })
    .greyscale()
    .threshold(180)
    .negate()
    .extractChannel(0)
    .png()
    .toBuffer();

  const logoForegroundBuffer = await sharp({
    create: {
      width: logoWidth,
      height: logoHeight,
      channels: 3,
      background: QR_DARK_COLOR,
    },
  })
    .joinChannel(logoMaskBuffer)
    .png()
    .toBuffer();

  return sharp(backgroundBuffer)
    .composite([
      {
        input: logoForegroundBuffer,
        left: logoLeft,
        top: logoTop,
      },
    ])
    .png()
    .toBuffer();
}

exports.generateReferralLink = onRequest(
  {cors: true, secrets: [RESEND_API_KEY]},
  async (req, res) => {
    try {
      if (req.method !== "POST") {
        res.status(405).json({error: "Method not allowed"});
        return;
      }

      const {email} = req.body || {};

      if (!email || typeof email !== "string") {
        res.status(400).json({error: "Missing email"});
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();
      const db = admin.firestore();
      const entryRef = db.doc(`sweepstakes_entries/${normalizedEmail}`);

      const referralCode = await db.runTransaction(async (tx) => {
        const entrySnap = await tx.get(entryRef);

        if (!entrySnap.exists) {
          throw new Error("Entry not found.");
        }

        const entry = entrySnap.data();

        if (entry.emailVerified !== true) {
          throw new Error("Email is not verified.");
        }

        if (entry.used !== true) {
          throw new Error("Survey has not been completed yet.");
        }

        if (entry.referralCode) {
          return entry.referralCode;
        }

        const newCode = crypto.randomBytes(4).toString("hex");

        tx.update(entryRef, {
          referralCode: newCode,
          referralLinkCreatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return newCode;
      });

      const referralLink = `https://win.bayblaze.net/?ref=${encodeURIComponent(
        referralCode
      )}`;

      const logoPath = path.join(
        __dirname,
        "assets",
        "bayblaze-flame-qr.png"
      );
      const finalQrBuffer = await buildStyledQrBuffer(referralLink, logoPath);

      const qrBase64 = finalQrBuffer.toString("base64");
      const qrDataUrl = `data:image/png;base64,${qrBase64}`;
      const qrContentId = "bayblaze-referral-qr";

      const resend = new Resend(RESEND_API_KEY.value());

      await resend.emails.send({
        from: "BAYBLAZE <noreply@bayblaze.net>",
        to: normalizedEmail,
        subject: "Your BayBlaze referral link",
        html: `
          <h2>Your BayBlaze referral link is ready!</h2>
          <p>Share this link with up to 5 friends:</p>
          <p><a href="${referralLink}">${referralLink}</a></p>
          <p>
            <img
              src="cid:${qrContentId}"
              alt="BayBlaze referral QR code"
              width="260"
              height="260"
              style="display: block; max-width: 260px; width: 100%; height: auto;"
            />
          </p>
          <p>Each friend who uses your link and completes the survey earns you one extra entry, up to 5 extra entries.</p>
        `,
        attachments: [
          {
            filename: "bayblaze-referral-qr-inline.png",
            content: qrBase64,
            contentId: qrContentId,
          },
          {
            filename: "bayblaze-referral-qr.png",
            content: qrBase64,
          },
        ],
      });

      await entryRef.update({
        referralEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      res.status(200).json({
        referralCode,
        referralLink,
        qrDataUrl,
      });
    } catch (error) {
      console.error(error);
      res.status(400).json({
        error: error.message || "Could not generate referral link.",
      });
    }
  }
);

exports.generateInstagramQr = onRequest(
  {cors: true},
  async (req, res) => {
    try {
      if (req.method !== "GET") {
        res.status(405).json({error: "Method not allowed"});
        return;
      }

      const instagramUrl = "https://www.instagram.com/tampabayblaze";
      const instagramLogoPath = path.join(
        __dirname,
        "assets",
        "instagram-logo-qr.png"
      );
      const qrBuffer = await QRCode.toBuffer(instagramUrl, {
        errorCorrectionLevel: "H",
        type: "png",
        width: QR_IMAGE_SIZE,
        margin: 0,
        color: {
          dark: QR_DARK_COLOR,
          light: QR_LIGHT_COLOR,
        },
      });
      const instagramLogoBuffer = await buildDirectLogoBuffer(
        instagramLogoPath,
        {
          horizontalPadding: 0,
          verticalPadding: 0,
          roundedRadiusRatio: 285 / 1080,
          maxSize: 360,
          badgeWidth: 390,
          badgeHeight: 390,
        }
      );
      const finalQrBuffer = await sharp(qrBuffer)
        .composite([
          {
            input: instagramLogoBuffer,
            gravity: "center",
          },
        ])
        .png()
        .toBuffer();

      res.set("Content-Type", "image/png");
      res.set(
        "Content-Disposition",
        'attachment; filename="bayblaze-instagram-qr.png"'
      );
      res.status(200).send(finalQrBuffer);
    } catch (error) {
      console.error(error);
      res.status(500).json({
        error: "Could not generate Instagram QR.",
      });
    }
  }
);

exports.getDashboardData = onRequest({cors: true}, async (req, res) => {
  try {
    if (req.method !== "GET") {
      res.status(405).json({error: "Method not allowed"});
      return;
    }

    const authorization = req.get("authorization") || "";
    const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);

    if (!tokenMatch) {
      res.status(401).json({error: "Missing credentials"});
      return;
    }

    const decodedToken = await admin.auth().verifyIdToken(tokenMatch[1]);

    if (!isDashboardAdmin(decodedToken)) {
      res.status(403).json({error: "Not authorized for dashboard access"});
      return;
    }

    const db = admin.firestore();
    const [surveyResponsesSnap, sweepstakesEntriesSnap] = await Promise.all([
      db.collection("survey_responses").get(),
      db
        .collection("sweepstakes_entries")
        .where("emailVerified", "==", true)
        .get(),
    ]);

    res.status(200).json({
      surveyResponses: surveyResponsesSnap.docs.map(serializeDocument),
      sweepstakesEntries: sweepstakesEntriesSnap.docs.map(serializeDocument),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({error: "Could not load dashboard data"});
  }
});

exports.startEmailVerification = onRequest(
  {cors: true, secrets: [RESEND_API_KEY]},
  async (req, res) => {
    try {
      if (req.method !== "POST") {
        res.status(405).json({error: "Method not allowed"});
        return;
      }

      const {email, referralCode} = req.body || {};

      if (!email || typeof email !== "string") {
        res.status(400).json({error: "Missing email"});
        return;
      }

      const normalizedEmail = normalizeEmail(email);
      const db = admin.firestore();
      const entryRef = db.doc(`sweepstakes_entries/${normalizedEmail}`);
      const verificationRef = db.doc(
        `${PENDING_VERIFICATIONS_COLLECTION}/${hashEmail(normalizedEmail)}`
      );
      const [entrySnap, verificationSnap] = await Promise.all([
        entryRef.get(),
        verificationRef.get(),
      ]);
      const normalizedReferralCode =
        typeof referralCode === "string" ? referralCode.trim() : "";
      let referredBy =
        (entrySnap.exists ? entrySnap.data().referredBy : null) ||
        (verificationSnap.exists ? verificationSnap.data().referredBy : null) ||
        null;
      let shouldUpdateReferredBy = false;

      if (
        entrySnap.exists &&
        entrySnap.data().used === true &&
        !isTestEmail(normalizedEmail)
      ) {
        res.status(409).json({error: "This email has already been used."});
        return;
      }

      if (!referredBy && normalizedReferralCode) {
        const referrerSnap = await db
          .collection("sweepstakes_entries")
          .where("referralCode", "==", normalizedReferralCode)
          .limit(1)
          .get();

        if (!referrerSnap.empty) {
          const referrerEmail = referrerSnap.docs[0].id;

          if (referrerEmail !== normalizedEmail) {
            referredBy = referrerSnap.docs[0].ref;
            shouldUpdateReferredBy = true;
          }
        }
      }

      if (entrySnap.exists && entrySnap.data().emailVerified === true) {
        if (shouldUpdateReferredBy) {
          await entryRef.update({referredBy});
        }

        res.status(200).json({
          status: "already_verified",
          email: normalizedEmail,
        });
        return;
      }

      const code = generateCode();
      const codeHash = hashCode(code);
      const expiresAt = admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + 10 * 60 * 1000)
      );
      const verificationData = {
        codeHash,
        expiresAt,
        attempts: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastSentAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (referredBy) {
        verificationData.referredBy = referredBy;
      }

      await verificationRef.set(verificationData, {merge: true});

      if (
        entrySnap.exists &&
        entrySnap.data().emailVerified !== true &&
        entrySnap.data().used !== true
      ) {
        await entryRef.delete();
      }

      const resend = new Resend(RESEND_API_KEY.value());

      await resend.emails.send({
        from: "BAYBLAZE <noreply@bayblaze.net>",
        to: normalizedEmail,
        subject: "Your BayBlaze verification code",
        html: `
          <h2>Your verification code is:</h2>
          <p style="font-size: 28px; font-weight: bold;">${code}</p>
          <p>This code expires in 10 minutes.</p>
        `,
      });

      res.status(200).json({
        status: "code_sent",
        email: normalizedEmail,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({error: "Server error"});
    }
  }
);

exports.verifyEmailCode = onRequest(
  {cors: true},
  async (req, res) => {
    try {
      if (req.method !== "POST") {
        res.status(405).json({error: "Method not allowed"});
        return;
      }

      const {email, code} = req.body || {};

      if (!email || !code) {
        res.status(400).json({error: "Missing email or code"});
        return;
      }

      const normalizedEmail = normalizeEmail(email);
      const submittedCodeHash = hashCode(code.trim());

      const db = admin.firestore();
      const entryRef = db.doc(`sweepstakes_entries/${normalizedEmail}`);
      const verificationRef = db.doc(
        `${PENDING_VERIFICATIONS_COLLECTION}/${hashEmail(normalizedEmail)}`
      );

      await db.runTransaction(async (tx) => {
        const verificationSnap = await tx.get(verificationRef);
        const entrySnap = await tx.get(entryRef);
        const entry = entrySnap.exists ? entrySnap.data() : null;

        if (entry?.used === true && !isTestEmail(normalizedEmail)) {
          throw new Error("This email has already been used.");
        }

        if (entry?.emailVerified === true) {
          if (verificationSnap.exists) {
            tx.delete(verificationRef);
          }

          return;
        }

        const verification = verificationSnap.exists ?
          verificationSnap.data() :
          entry?.verification || null;
        const isPendingVerification = verificationSnap.exists;

        if (!verification) {
          throw new Error("No verification code found.");
        }

        if (verification.attempts >= 5) {
          throw new Error("Too many attempts. Request a new code.");
        }

        const now = admin.firestore.Timestamp.now();

        if (verification.expiresAt.toMillis() < now.toMillis()) {
          throw new Error("Verification code expired.");
        }

        if (verification.codeHash !== submittedCodeHash) {
          if (isPendingVerification) {
            tx.update(verificationRef, {
              attempts: admin.firestore.FieldValue.increment(1),
            });
          } else {
            tx.update(entryRef, {
              "verification.attempts": admin.firestore.FieldValue.increment(1),
            });
          }

          throw new Error("Incorrect verification code.");
        }

        const referredBy = entry?.referredBy || verification.referredBy || null;

        if (entrySnap.exists) {
          const entryUpdate = {
            email: normalizedEmail,
            emailVerified: true,
            verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
            verification: admin.firestore.FieldValue.delete(),
          };

          if (entry.used !== true) {
            entryUpdate.used = false;
          }

          if (!Array.isArray(entry.referrals)) {
            entryUpdate.referrals = [];
          }

          if (typeof entry.referralCount !== "number") {
            entryUpdate.referralCount = 0;
          }

          if (referredBy) {
            entryUpdate.referredBy = referredBy;
          }

          tx.update(entryRef, entryUpdate);
        } else {
          const entryData = {
            email: normalizedEmail,
            used: false,
            emailVerified: true,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
            referrals: [],
            referralCount: 0,
          };

          if (referredBy) {
            entryData.referredBy = referredBy;
          }

          tx.set(entryRef, entryData);
        }

        if (verificationSnap.exists) {
          tx.delete(verificationRef);
        }
      });

      res.status(200).json({
        status: "verified",
        email: normalizedEmail,
      });
    } catch (error) {
      console.error(error);
      res.status(400).json({
        error: error.message || "Verification failed",
      });
    }
  }
);

exports.updateSweepstakesFromForm = onRequest({cors: true}, async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).send("Method not allowed");
      return;
    }

    const {
      email,
      instagramHandle,
      favoriteVapeBrand,
      favoriteVapeFlavor,
      favoriteCigaretteBrand,
      smokeShopProducts,
      vapePriority,
      zipCode,
    } = req.body || {};

    if (!email || typeof email !== "string") {
      res.status(400).send("Missing email");
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedFavoriteVapeBrand =
      typeof favoriteVapeBrand === "string" ? favoriteVapeBrand.trim() : "";
    const normalizedFavoriteVapeFlavor =
      typeof favoriteVapeFlavor === "string" ? favoriteVapeFlavor.trim() : "";
    const normalizedFavoriteCigaretteBrand =
      typeof favoriteCigaretteBrand === "string" ?
        favoriteCigaretteBrand.trim() :
        "";
    const normalizedVapePriority =
      typeof vapePriority === "string" ? vapePriority.trim() : "";
    const normalizedZipCode =
      typeof zipCode === "string" ? zipCode.trim() : "";
    const normalizedSmokeShopProducts = Array.isArray(smokeShopProducts) ?
      smokeShopProducts
        .filter((value) => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean) :
      [];

    if (!normalizedFavoriteVapeBrand) {
      res.status(400).send("Missing favorite vape brand");
      return;
    }

    if (!normalizedFavoriteVapeFlavor) {
      res.status(400).send("Missing favorite vape flavor");
      return;
    }

    if (!normalizedFavoriteCigaretteBrand) {
      res.status(400).send("Missing favorite cigarette brand");
      return;
    }

    if (!normalizedSmokeShopProducts.length) {
      res.status(400).send("Missing smoke shop products");
      return;
    }

    if (!normalizedVapePriority) {
      res.status(400).send("Missing vape priority");
      return;
    }

    if (!normalizedZipCode) {
      res.status(400).send("Missing zip code");
      return;
    }

    if (!/^\d{5}$/.test(normalizedZipCode)) {
      res.status(400).send("Invalid zip code");
      return;
    }

    let normalizedInstagramHandle = null;
    if (typeof instagramHandle === "string" && instagramHandle.trim()) {
      normalizedInstagramHandle = instagramHandle.trim().toLowerCase();

      if (normalizedInstagramHandle.startsWith("@")) {
        normalizedInstagramHandle = normalizedInstagramHandle.slice(1);
      }

      normalizedInstagramHandle = normalizedInstagramHandle.replace(/\s+/g, "");
    }

    const db = admin.firestore();
    const entryRef = db.doc(`sweepstakes_entries/${normalizedEmail}`);
    const entrySnap = await entryRef.get();

    if (!entrySnap.exists) {
      res.status(404).send("Entry not found");
      return;
    }

    await db.runTransaction(async (tx) => {
      const freshEntrySnap = await tx.get(entryRef);

      if (!freshEntrySnap.exists) {
        throw new Error("Entry disappeared");
      }

      const freshEntryData = freshEntrySnap.data();

      if (freshEntryData.used === true && !isTestEmail(normalizedEmail)) {
        return;
      }

      if (freshEntryData.emailVerified !== true) {
        throw new Error("Email is not verified.");
      }

      const referredBy = freshEntryData.referredBy || null;
      const referrerRef =
        referredBy && typeof referredBy.path === "string" ? referredBy : null;
      const isSelfReferral =
        referrerRef && referrerRef.path === entryRef.path;
      const referrerSnap = referrerRef ? await tx.get(referrerRef) : null;
      const responseRef = db.collection("survey_responses").doc();

      tx.update(entryRef, {
        used: true,
        surveyResponse: responseRef,
        formSubmittedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      tx.set(responseRef, {
        email: normalizedEmail,
        entry: entryRef,
        instagramHandle: normalizedInstagramHandle,
        favoriteVapeBrand: normalizedFavoriteVapeBrand,
        favoriteVapeFlavor: normalizedFavoriteVapeFlavor,
        favoriteCigaretteBrand: normalizedFavoriteCigaretteBrand,
        smokeShopProducts: normalizedSmokeShopProducts,
        vapePriority: normalizedVapePriority,
        zipCode: normalizedZipCode,
        submittedAt: admin.firestore.FieldValue.serverTimestamp(),
        source: "react_form",
      });

      if (referrerRef && !isSelfReferral && referrerSnap.exists) {
        const referrerData = referrerSnap.data();
        const currentReferrals = Array.isArray(referrerData.referrals)
          ? referrerData.referrals
          : [];

        const alreadyCredited = currentReferrals.some(
          (referral) => referral?.path === entryRef.path
        );
        const underLimit = currentReferrals.length < 5;

        if (!alreadyCredited && underLimit) {
          tx.update(referrerRef, {
            referrals: admin.firestore.FieldValue.arrayUnion(entryRef),
            referralCount: admin.firestore.FieldValue.increment(1),
          });
        }
      }
    });

    res.status(200).send("OK");
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
});

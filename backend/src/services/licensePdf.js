// Sync licence certificate (PDF, Polish + English). Regenerated on demand from the order row,
// so the stored order is the single source of truth.
const path = require("path");
const PDFDocument = require("pdfkit");

const FONT = path.join(__dirname, "../assets/fonts/DejaVuSans.ttf");
const FONT_BOLD = path.join(__dirname, "../assets/fonts/DejaVuSans-Bold.ttf");

const TERMS_URL = "https://hardbanrecordslab.online/sync-license-terms/";
const TERMS_VERSION = "2026-10-11";

// Scope per tier — must match § 2 of the terms (legal/zrodla/warunki-licencji-sync.html).
const SCOPE = {
  online: {
    pl: "Filmy i nagrania w internecie: YouTube, media społecznościowe, podcasty, transmisje, strony WWW — także kanały z monetyzacją; prezentacje i materiały szkoleniowe. Bez płatnej promocji.",
    en: "Online videos and recordings: YouTube, social media, podcasts, streams, websites — monetised channels included; presentations and training material. No paid advertising.",
  },
  commercial: {
    pl: "Zakres pakietu Online oraz reklamy i płatna promocja w internecie, filmy firmowe i produktowe, wydarzenia, targi, materiały odtwarzane w sklepach i punktach sprzedaży.",
    en: "Everything in Online plus online ads and paid promotion, corporate and product videos, events, trade fairs and in-store playback of the project.",
  },
};

function licensor() {
  const address = process.env.LICENSOR_ADDRESS || "Wiercień 50, 59-307 Wiercień, Polska";
  return `Kamil Skomra — HardbanRecords Lab, ${address}, licensing@hardbanrecordslab.online`;
}

function money(grosze) {
  return `$${(grosze / 100).toFixed(2)}`;
}

/** Returns a Promise<Buffer>. */
function buildCertificate(order, verifyUrl) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 56, info: { Title: `Licencja ${order.number}`, Author: "HardbanRecords Lab" } });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.registerFont("r", FONT);
    doc.registerFont("b", FONT_BOLD);

    const gray = "#555555";
    const accent = "#6D28D9";
    const W = doc.page.width - 112;

    doc.font("b").fontSize(10).fillColor(accent).text("HRL SYNC HUB · HARDBANRECORDS LAB");
    doc.moveDown(0.6);
    doc.font("b").fontSize(20).fillColor("#111111").text("Certyfikat licencji synchronizacyjnej");
    doc.font("r").fontSize(11).fillColor(gray).text("Sync License Certificate");
    doc.moveDown(0.8);
    doc.font("b").fontSize(12).fillColor("#111111").text(`Nr licencji / License no.: ${order.number}`);
    const paid = new Date(order.paid_at || order.created_at);
    doc.font("r").fontSize(10).fillColor(gray).text(`Data udzielenia / Date of grant: ${paid.toISOString().slice(0, 10)}`);
    doc.moveDown(1);

    const row = (labelPl, labelEn, value) => {
      doc.font("b").fontSize(9).fillColor(gray).text(`${labelPl} / ${labelEn}`.toUpperCase());
      doc.font("r").fontSize(11).fillColor("#111111").text(value || "—", { width: W });
      doc.moveDown(0.6);
    };
    row("Licencjodawca", "Licensor", licensor());
    row("Licencjobiorca", "Licensee", [order.buyer_name, order.buyer_company, order.buyer_email].filter(Boolean).join(", "));
    row("Utwór", "Track", `${order.track_title} — ${order.track_artist} (ID ${order.track_id})`);
    row("Projekt", "Project", order.project_title + (order.project_description ? ` — ${order.project_description}` : ""));
    row("Pakiet", "Tier", `${order.tier_name} · ${money(order.price_grosze)}`);

    const scope = SCOPE[order.tier_code] || { pl: "Zgodnie z indywidualną umową.", en: "As agreed individually." };
    doc.font("b").fontSize(9).fillColor(gray).text("ZAKRES / SCOPE");
    doc.font("r").fontSize(10).fillColor("#111111").text(scope.pl, { width: W });
    doc.fillColor(gray).text(scope.en, { width: W });
    doc.moveDown(0.6);

    doc.font("b").fontSize(9).fillColor(gray).text("WARUNKI / TERMS");
    doc.font("r").fontSize(10).fillColor("#111111").text(
      "Licencja niewyłączna, na całym świecie, bez ograniczenia w czasie, na połączenie Utworu z Projektem i rozpowszechnianie Projektu w zakresie pakietu. " +
      "Wolno skracać, zapętlać i miksować Utwór w Projekcie. Nie wolno udostępniać Utworu osobno, rejestrować go w Content ID ani używać do trenowania AI. " +
      "Nowy projekt wymaga nowej licencji.", { width: W });
    doc.fillColor(gray).text(
      "Non-exclusive, worldwide, perpetual licence to synchronise the Track with the Project and distribute the Project within the tier. " +
      "Editing, looping and mixing within the Project are allowed. No standalone distribution, no Content ID registration, no AI training. " +
      "A new project needs a new licence.", { width: W });
    doc.moveDown(0.6);
    doc.fillColor("#111111").text(`Pełne warunki / Full terms (wersja ${TERMS_VERSION}): ${TERMS_URL}`, { width: W, link: TERMS_URL });
    doc.moveDown(0.6);
    doc.text("Roszczenia Content ID / platform claims: wyślij numer licencji na licensing@hardbanrecordslab.online — zwolnimy roszczenie w ciągu 3 dni roboczych. " +
      "Send the licence number to licensing@hardbanrecordslab.online and we will release the claim within 3 business days.", { width: W });
    doc.moveDown(0.8);
    if (verifyUrl) doc.fillColor(accent).text(`Weryfikacja / Verify: ${verifyUrl}`, { width: W, link: verifyUrl });
    doc.moveDown(1.2);
    doc.font("r").fontSize(8).fillColor(gray).text(
      "Licencjodawca jest zwolniony z VAT (art. 113 ust. 1 ustawy o VAT). Licencjobiorca wyraził zgodę na natychmiastowe dostarczenie treści cyfrowej " +
      "i przyjął do wiadomości utratę prawa odstąpienia (art. 38 ust. 1 pkt 13 ustawy o prawach konsumenta).", { width: W });
    doc.end();
  });
}

module.exports = { buildCertificate, TERMS_URL, TERMS_VERSION, SCOPE };

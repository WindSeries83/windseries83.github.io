// Rendu de la page de partage : des données du serveur vers du HTML, sans DOM.
// Tout texte venu du serveur passe par echapper() ; une adresse n'est utilisée que si elle est en https.

const TRACES = {
  tel: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  msg: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z"/>',
  retour: '<path d="M15 18l-6-6 6-6"/>',
  ok: '<path d="M20 6L9 17l-5-5"/>',
};
const ico = (nom) => '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">' + TRACES[nom] + '</svg>';
// Le logo est une image de fond (thème clair ou sombre) : jamais de <img> qui ne soit pas une photo du serveur.
const LOGO = '<span class="logo" role="img" aria-label="AutoDeal"></span>';

const ENTITES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function echapper(texte) {
  return texte == null ? '' : String(texte).replace(/[&<>"']/g, (c) => ENTITES[c]);
}

// Un fait affichable : texte ou nombre fini, sinon rien (jamais « null » ni « NaN » à l'écran).
const fait = (v) => (typeof v === 'string' ? v.trim() : Number.isFinite(v) ? String(v) : '');
const https = (v) => (typeof v === 'string' && v.startsWith('https://') ? v : '');
const nombre = new Intl.NumberFormat('fr-FR');
const ETATS = { reservee: 'Déjà réservée', reservee_pour_vous: 'Réservée pour vous', vendue: 'Vendue' };
const guillemets = (texte) => '« ' + echapper(texte) + ' »';

// Numéro au format international, chiffres seuls : « 06… » est lu comme français, « +33 (0)6… » perd son zéro.
// shortcut: un numéro étranger écrit sans indicatif est pris pour français ; à reprendre si l'app sort de France.
function international(telephone) {
  const brut = fait(telephone);
  let chiffres = brut.replace(/\D/g, '');
  if (chiffres.startsWith('00')) chiffres = chiffres.slice(2);
  else if (!brut.startsWith('+') && chiffres.startsWith('0')) chiffres = '33' + chiffres.slice(1);
  return chiffres.startsWith('330') ? '33' + chiffres.slice(3) : chiffres;
}

export function lienWhatsApp(telephone, message) {
  const numero = international(telephone);
  return numero ? 'https://wa.me/' + numero + (message ? '?text=' + encodeURIComponent(message) : '') : '';
}

// Le nombre du titre en lettres jusqu'à dix, en chiffres au-delà.
const NOMBRES = ['Une', 'Deux', 'Trois', 'Quatre', 'Cinq', 'Six', 'Sept', 'Huit', 'Neuf', 'Dix'];
const combien = (n) => NOMBRES[n - 1] ?? String(n);
export function accroche(n) {
  return n === 1 ? 'Une voiture choisie pour vous' : combien(n) + ' voitures choisies pour vous';
}

function courtierDe(page) {
  const c = page?.courtier ?? {};
  const nom = fait(c.nom);
  const prenom = fait(c.prenom) || nom.split(/\s+/)[0];
  const telephone = fait(c.telephone);
  return {
    nom, prenom, telephone, deQui: prenom || 'votre courtier',
    activite: fait(c.activite), email: fait(c.email), photo: https(c.photo),
    appel: international(telephone) && '+' + international(telephone),
  };
}

// « Marc Delmas, courtier… » : l'activité perd sa majuscule de début de phrase, pas celle d'un sigle (« SARL… »).
function presentation(c) {
  if (!c.nom) return 'Votre courtier';
  if (!c.activite) return c.nom;
  return c.nom + ', ' + (/^.\p{Ll}/u.test(c.activite) ? c.activite[0].toLowerCase() + c.activite.slice(1) : c.activite);
}

function voitureDe(v) {
  const f = v?.fiche ?? {};
  const photos = (Array.isArray(f.photos) ? f.photos : [])
    .filter((p) => https(p?.vignette) && https(p?.affichage)).slice(0, 30); // plafond du serveur
  const prix = Number.isFinite(f.prix) && f.prix > 0
    ? nombre.format(f.prix) + ' €' + (f.prix_ht === true ? ' <small>HT</small>' : '') : '';
  const nomComplet = [fait(f.marque), fait(f.modele)].filter(Boolean).join(' ');
  return {
    id: fait(v?.id), interet: v?.interet === true, photos, prix, nomComplet,
    dispo: f.etat === 'dispo', etat: ETATS[f.etat] ?? '', pourVous: f.etat === 'reservee_pour_vous',
    annee: fait(f.annee), km: Number.isFinite(f.km) ? nombre.format(f.km) + ' km' : '',
    energie: fait(f.energie), boite: fait(f.boite), carrosserie: fait(f.carrosserie),
    version: [fait(f.finition), fait(f.motorisation)].filter(Boolean).join(', '),
    avis: fait(f.avis),
    observations: (Array.isArray(f.observations) ? f.observations : []).map(fait).filter(Boolean),
  };
}

function expiration(page) {
  const date = new Date(page?.expire_le ?? NaN);
  if (Number.isNaN(date.getTime())) return '';
  const [jour, mois] = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' })
    .format(date).split(' ');
  return 'Cette sélection reste en ligne jusqu’au ' + (jour === '1' ? '1er' : jour) + ' ' + mois + '. ';
}

// Le logo et le filet violet vers ambre, en haut de chaque écran.
const marque = (avant = '') => '<div class="marque g">' + avant + LOGO + '</div><div class="filet"></div>';

// Qui écrit, ce que c'est, son mot signé.
function entete(page, n, balise) {
  const c = courtierDe(page);
  const mot = fait(page?.mot);
  return '<header class="entete g"><p class="qui">' + echapper(presentation(c)) + '</p>' +
    '<' + balise + ' class="accroche large">' + accroche(n) + '</' + balise + '>' +
    (mot ? '<div><p class="mot">' + guillemets(mot) + '</p>' + (c.prenom ? '<p class="signe">' + echapper(c.prenom) + '</p>' : '') + '</div>' : '') +
    '</header>';
}

function pied(page, site) {
  const c = courtierDe(page);
  const adresse = https(site);
  const coord = [c.nom, c.telephone, c.email].filter(Boolean).map(echapper).join(', ');
  return '<footer class="pied g"><p>' + expiration(page) + 'Lien privé : seules les personnes qui l’ont reçu voient cette page.</p>' +
    (coord ? '<p class="coord">' + coord + '</p>' : '') +
    '<p class="avec">Page créée avec ' + LOGO +
    (adresse ? '<a class="decouvrir" href="' + echapper(adresse) + '" target="_blank" rel="noopener">Découvrir</a>' : '') + '</p></footer>';
}

// Appeler et WhatsApp, seulement avec un numéro : jamais de bouton mort.
function joindre(c, message = '') {
  const whatsapp = lienWhatsApp(c.telephone, message);
  return c.appel && whatsapp ? '<a class="joindre" href="tel:' + echapper(c.appel) + '">' + ico('tel') + 'Appeler</a>' +
    '<a class="joindre" href="' + echapper(whatsapp) + '" target="_blank" rel="noopener noreferrer">' + ico('msg') + 'WhatsApp</a>' : '';
}

// Après le clic, le message prêt pour WhatsApp.
function messageInteret(a) {
  const article = /^[aeiouyàâéèêëîïôöùûü]/i.test(a.nomComplet) ? 'l’' : 'la ';
  return 'Bonjour, ' + article + a.nomComplet + ' m’intéresse.';
}

const note = (c) => 'C’est noté, ' + echapper(c.deQui) + ' le verra.';
const etat = (a) => (a.dispo || !a.etat ? '' : '<p class="etat' + (a.pourVous ? ' pour-vous' : '') + '">' + a.etat + '</p>');

export function rendreListe(page, site = '') {
  const voitures = (Array.isArray(page?.voitures) ? page.voitures : []).map(voitureDe);
  const c = courtierDe(page);
  const premiere = voitures.findIndex((a) => a.photos.length); // seule vignette chargée tout de suite
  const articles = voitures.map((a, rang) => {
    const id = echapper(a.id);
    const n = a.photos.length;
    const faits = [a.annee, a.km, a.energie, a.boite].filter(Boolean);
    const whatsapp = lienWhatsApp(c.telephone, messageInteret(a));
    return '<article class="voiture">' +
      (n ? '<button type="button" class="photo" data-va="' + id + '" aria-label="Voir ' + echapper(a.nomComplet) + ' en détail">' +
        '<img src="' + echapper(a.photos[0].vignette) + '" alt="' + echapper(a.nomComplet) + '" loading="' + (rang === premiere ? 'eager' : 'lazy') + '">' +
        '<span class="nb">' + n + (n > 1 ? ' photos' : ' photo') + '</span></button>' : '') +
      '<div class="corps g"><div class="ligne"><h2 class="nomv large">' + echapper(a.nomComplet) + '</h2>' +
        (a.prix ? '<p class="prix large">' + a.prix + '</p>' : '') + '</div>' +
        (faits.length ? '<ul class="faits">' + faits.map((f) => '<li>' + echapper(f) + '</li>').join('') + '</ul>' : '') +
        etat(a) +
        (a.dispo && !a.interet ? '<button type="button" class="oui" data-interet="' + id + '">Ça m’intéresse</button>' : '') +
        (a.dispo && a.interet ? '<div class="note"><b>' + note(c) + '</b>' +
          (whatsapp ? '<a class="detail" href="' + echapper(whatsapp) + '" target="_blank" rel="noopener noreferrer">Lui écrire sur WhatsApp</a>' : '') + '</div>' : '') +
        '<button type="button" class="detail" data-va="' + id + '">' +
          (n > 1 ? 'Voir les ' + n + ' photos et le détail' : n ? 'Voir la photo et le détail' : 'Voir le détail') + '</button>' +
      '</div></article>';
  }).join('');
  return marque() + entete(page, voitures.length, 'h1') + articles + pied(page, site) +
    '<div class="barre g">' + (c.photo ? '<img class="portrait" src="' + echapper(c.photo) + '" alt="">' : '') +
    '<div class="n"><b class="large">' + echapper(c.nom || 'Votre courtier') + '</b>' +
    (c.telephone ? '<span>' + echapper(c.telephone) + '</span>' : '') + '</div>' + joindre(c) + '</div>';
}

export function rendreFiche(page, voitureId, site = '') {
  const toutes = Array.isArray(page?.voitures) ? page.voitures : [];
  const brute = toutes.find((v) => v?.id === voitureId);
  if (!brute) return rendreListe(page, site);
  const a = voitureDe(brute);
  const c = courtierDe(page);
  const n = toutes.length;
  const faits = [['Année', a.annee], ['Kilométrage', a.km], ['Énergie', a.energie], ['Boîte', a.boite], ['Carrosserie', a.carrosserie]]
    .filter(([, valeur]) => valeur);
  return marque(n > 1 ? '<button type="button" class="retour" data-va="">' + ico('retour') + 'Les ' + combien(n).toLowerCase() + ' voitures</button>' : '') +
    (n === 1 ? entete(page, 1, 'p') : '') + // une seule voiture : pas de liste pour porter le mot
    (a.photos.length ? '<div class="cadre"><div class="galerie" tabindex="0" aria-label="Photos, faire défiler">' +
      a.photos.map((p, i) => '<div class="vue"><img src="' + echapper(p.affichage) + '" alt="' +
        echapper(a.nomComplet + (i ? ', photo ' + (i + 1) : '')) + '" loading="' + (i ? 'lazy' : 'eager') + '"></div>').join('') +
      '</div><span class="nb" data-compteur="' + a.photos.length + '">1 / ' + a.photos.length + '</span></div>' : '') +
    '<main class="fiche g"><div class="titre"><h1 class="large">' + echapper(a.nomComplet) + '</h1>' +
      (a.version ? '<p class="version">' + echapper(a.version) + '</p>' : '') +
      (a.prix ? '<p class="prix large">' + a.prix + '</p>' : '') + etat(a) + '</div>' +
      (faits.length ? '<dl class="table">' + faits.map(([nom, valeur]) => '<div><dt>' + nom + '</dt><dd>' + echapper(valeur) + '</dd></div>').join('') + '</dl>' : '') +
      (a.avis ? '<section class="bloc"><h2 class="large">Le mot de ' + echapper(c.deQui) + '</h2><p class="mot">' + guillemets(a.avis) + '</p></section>' : '') +
      (a.observations.length ? '<section class="bloc"><h2 class="large">À savoir</h2><ul>' +
        a.observations.map((o) => '<li>' + echapper(o) + '</li>').join('') + '</ul></section>' : '') +
    '</main>' + pied(page, site) +
    '<div class="barre g">' +
    (a.dispo && !a.interet ? '<button type="button" class="oui" data-interet="' + echapper(a.id) + '">Ça m’intéresse</button>'
      : a.dispo ? '<p class="fait">' + ico('ok') + note(c) + '</p>'
        : a.etat ? '<p class="fait">' + a.etat + '</p>' : '') +
    joindre(c, a.dispo && a.interet ? messageInteret(a) : '') + '</div>';
}

// Impasses : un titre, une phrase, et l'action possible s'il y en a une.
const impasse = (contenu) => marque() + '<main class="seul g">' + contenu + '</main>';

export function rendreInvalide() {
  return impasse('<h1 class="large">Ce lien n’est plus valable</h1><p>Demandez un nouveau lien à la personne qui vous l’a envoyé.</p>');
}

export function rendreErreur() {
  return impasse('<h1 class="large">Connexion impossible</h1><p>Vérifiez votre connexion, puis réessayez.</p>' +
    '<button type="button" class="oui" data-reessayer>Réessayer</button>');
}

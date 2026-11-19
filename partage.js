// Page de partage : lit le lien auprès du serveur, affiche, enregistre « Ça m'intéresse ».
import { rendreListe, rendreFiche, rendreInvalide, rendreErreur } from './rendu.js';

export function jetonDe(hash) {
  const jeton = String(hash ?? '').replace(/^#/, '');
  return /^[0-9a-f]{64}$/.test(jeton) ? jeton : null;
}

// Dépendances passées en paramètres : le test fournit les siennes.
export async function demarrer({ reglages, document, location, fetch, history }) {
  const racine = document.getElementById('page');
  const fenetre = document.defaultView;
  const jeton = jetonDe(location.hash);
  let page = null; // dernière réponse de lire_partage
  let ouverte = history?.state?.voiture ?? null; // voiture montrée, ou null pour la liste ; l'état survit à un rechargement
  const enCours = new Set(); // clics partis, pour qu'un double appui ne fasse qu'un appel

  const appeler = async (fonction, corps) => {
    const reponse = await fetch(reglages.url + '/rest/v1/rpc/' + fonction, {
      method: 'POST',
      // Clé sur « apikey » seulement : les clés publiques de Supabase ne sont pas des JWT, « Bearer » les fait refuser.
      headers: { apikey: reglages.cle, 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
      signal: AbortSignal.timeout(15000), // réseau figé : « Réessayer » plutôt que « Chargement… » sans fin
    });
    if (!reponse.ok) throw new Error('HTTP ' + reponse.status);
    return reponse.json();
  };

  const montrer = () => {
    const id = ouverte ?? (page.voitures.length === 1 ? page.voitures[0].id : null);
    racine.innerHTML = id ? rendreFiche(page, id, reglages.siteAutoDeal) : rendreListe(page, reglages.siteAutoDeal);
  };

  const charger = async () => {
    if (!jeton) { racine.innerHTML = rendreInvalide(); return; }
    try {
      page = await appeler('lire_partage', { p_jeton: jeton });
    } catch {
      racine.innerHTML = rendreErreur();
      return;
    }
    if (Array.isArray(page?.voitures) && page.voitures.length) montrer();
    else racine.innerHTML = rendreInvalide();
  };

  const signaler = async (id) => {
    if (enCours.has(id)) return;
    enCours.add(id);
    try {
      if (await appeler('signaler_interet', { p_jeton: jeton, p_voiture: id }) === true) {
        page.voitures.find((v) => v.id === id).interet = true;
        // Le rendu refait la galerie : la remettre sur la photo que le client regardait.
        const photo = racine.querySelector('.galerie')?.scrollLeft;
        montrer();
        if (photo) racine.querySelector('.galerie')?.scrollTo({ left: photo, behavior: 'instant' });
      } else {
        await charger(); // vendue ou réservée entre-temps : montrer le nouvel état
      }
    } catch {
      racine.innerHTML = rendreErreur();
    } finally {
      enCours.delete(id);
    }
  };

  // Ouvrir une fiche ajoute une entrée d'historique sans toucher à l'adresse (le jeton y reste) :
  // le bouton retour du téléphone revient à la liste au lieu de quitter la page.
  const aller = (id) => {
    if (id) history?.pushState({ voiture: id }, '');
    else if (history?.state?.voiture) { history.back(); return; }
    ouverte = id;
    montrer();
    fenetre?.scrollTo(0, 0);
  };

  document.addEventListener('click', async (evenement) => {
    const cible = (selecteur) => evenement.target.closest?.(selecteur);
    // Le temps de l'appel : bouton éteint et grisé, pour que l'appui se voie ; le rendu suivant le remplace.
    const occuper = (bouton) => { bouton.disabled = true; bouton.setAttribute('aria-busy', 'true'); };
    const reessayer = cible('[data-reessayer]');
    if (reessayer) { occuper(reessayer); await charger(); return; }
    const va = cible('[data-va]');
    if (va) { aller(va.dataset.va || null); return; }
    const interet = cible('[data-interet]');
    if (interet && !interet.disabled) {
      occuper(interet);
      await signaler(interet.dataset.interet);
    }
  });
  // Le défilement ne remonte pas : écoute en capture, pour le compteur de la galerie.
  document.addEventListener('scroll', (evenement) => {
    const galerie = evenement.target;
    const compteur = galerie.classList?.contains('galerie') && galerie.parentNode.querySelector('[data-compteur]');
    if (!compteur) return;
    const total = Number(compteur.dataset.compteur);
    const rang = Math.round(galerie.scrollLeft / galerie.clientWidth) + 1;
    compteur.textContent = Math.min(Math.max(rang, 1), total) + ' / ' + total;
  }, true);
  fenetre?.addEventListener('popstate', (evenement) => {
    if (!page) return;
    ouverte = evenement.state?.voiture ?? null;
    montrer();
  });
  // Un autre lien ouvert dans le même onglet ne change que le « # » : repartir de zéro.
  fenetre?.addEventListener('hashchange', () => location.reload());

  await charger();
}

if (globalThis.document) {
  // Sans réglages (fichier absent), un lien sans jeton reste « plus valable » et tout autre finit sur « Réessayer ».
  const reglages = await import('./reglages.js').catch(() => ({}));
  await demarrer({ reglages, document, location, fetch: (...a) => fetch(...a), history });
}

# Fiche terrain

Formulaire mobile en français pour remplir la fiche de vérification d’adéquation des moyens et télécharger un PNG de 1580 × 2250 pixels utilisant le modèle fourni.

## État

- Formulaire et export PNG disponibles sans compte.
- Connexion, inscription, confirmation par e-mail, récupération de mot de passe et profil entreprise/équipe implémentés.
- Projet Supabase dédié raccordé : `mvgikkhcxidcirdxwyna` (organisation « Adequation des moyens », offre Free).
- Table des profils et politiques RLS déployées et testées sur ce projet.
- **Les comptes restent désactivés en attendant la vérification de l’envoi des e-mails et des URL de retour.**
- Aucune fiche, référence client, adresse, observation ou image n’est envoyée à Supabase.

## Développement

Node.js 22 ou plus récent.

```sh
npm ci
npm test
npm run build
```

`public/` contient le formulaire et les assets, `src/` le module des comptes. Le build copie le site et son SDK Supabase intégré dans `docs/`. Les dépendances sont épinglées dans `package.json` et `package-lock.json` ; aucun CDN n’est nécessaire au fonctionnement.

## Hébergement GitHub Pages gratuit

Dans **Settings → Pages**, choisir **Deploy from a branch**, branche **main**, dossier **/docs**, puis **Save**. Le site attendu est :

https://Stay66000.github.io/Fiche-t-rrain/

Cette adresse n’est disponible qu’après activation et publication réussie de GitHub Pages. Après une modification, reconstruire avec `npm run build`, puis committer aussi `docs/`.

## Activer les comptes

Utiliser uniquement le nouveau projet dédié dans l’organisation « Adequation des moyens ».

1. Déjà effectué sur le projet indiqué : appliquer `supabase/profiles.sql` dans ce projet. Il crée uniquement la table des profils, les droits explicites et les politiques RLS limitant chaque utilisateur à son propre profil.
2. Activer le fournisseur Email et conserver la confirmation des adresses e-mail. Configurer un SMTP autorisé pour les utilisateurs publics : le SMTP Supabase par défaut ne délivre pas aux adresses hors équipe du projet. Vérifier le coût et les quotas du fournisseur avant tout choix.
3. Dans Auth → URL Configuration, définir le Site URL et autoriser l’URL exacte publiée, avec le chemin du dépôt et la barre finale. Exemple : `https://stay66000.github.io/Fiche-t-rrain/`.
4. Dans `public/config.js`, renseigner l’URL Supabase et une clé **publishable** (`sb_publishable_…`). Ne jamais utiliser de clé secrète, de clé service_role ni de mot de passe dans le dépôt.
5. Tester le schéma et les parcours sur le nouveau projet : accès anonyme interdit, lecture/modification de son propre profil autorisées, accès au profil d’un autre compte interdit, confirmation, connexion, déconnexion, mot de passe oublié, rechargement et accès sans compte.
6. Passer `accountsEnabled` à `true`, reconstruire et publier après configuration. Ne pas présenter les comptes comme opérationnels avant les vérifications sur le vrai projet.

## Données et fonctionnement

Les fiches vivent uniquement dans la mémoire de la page et dans le PNG téléchargé sur l’appareil. Le bouton d’effacement vide la fiche et remet l’entreprise et l’équipe du profil connecté. Aucun historique de fiches n’est conservé.

Seuls l’e-mail d’authentification et le profil entreprise/équipe sont enregistrés dans Supabase. Le SDK conserve la session de connexion dans le navigateur (`fiche-terrain-auth`) pour éviter de ressaisir son mot de passe à chaque visite. Les mots de passe sont traités par Supabase Auth ; le site ne les conserve pas lui-même.

Le préremplissage automatique respecte une entreprise ou une équipe déjà saisie. Le bouton « Utiliser les informations de mon profil » permet de les remplacer explicitement. Modifier une fiche ne modifie pas le profil. Enregistrer le profil met à jour ces deux champs dans la fiche courante.

Les 9 tests automatisés locaux vérifient la validation, la séparation des données, le ciblage du profil authentifié et la propagation des erreurs. `supabase/verify-profiles.sql` a aussi été exécuté avec succès sur le projet réel : lecture/écriture du profil propre autorisées, accès à un autre profil, réattribution et accès anonyme interdits. Les utilisateurs synthétiques ont été annulés par ROLLBACK et leur absence vérifiée. Les parcours e-mail complets et les tests Safari/Chrome mobile restent à effectuer.

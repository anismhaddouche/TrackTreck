# TrackTreck Test
Ce projet sert à valider la CI/CD GitHub Actions vers GHCR.

## 📅 Planning (12 Semaines)
Voir : [ROADMAP.md](ROADMAP.md)

---

## 🤝 Guide de Collaboration (Étudiant)

Pour garantir la qualité du code et la stabilité de la production, nous suivons ce flux de travail :

### 1. Initialisation
```bash
git clone https://github.com/anismhaddouche/TrackTreck.git
git checkout -b develop  # Toute modification se fait ICI
```

### 2. Développement (MoSCoW Rules)
- Ne travaillez JAMAIS directement sur la branche `main`.
- Créez des branches thématiques si besoin : `feat/p1-whatsapp`.
- Testez votre Docker en local avant de pousser : `docker compose up --build`.

### 3. Livraison (Pull Request)
Une fois une fonctionnalité terminée :
1. Poussez votre branche : `git push origin develop`.
2. Allez sur GitHub et créez une **Pull Request (PR)** vers `main`.
3. Le build Docker CI/CD se lancera automatiquement pour vérifier votre code.
4. **Attendez la validation** de l'administrateur avant le merge.

---

## 🔒 Gestion des Secrets
Ne mettez JAMAIS de fichiers `.env` ou de clés API dans Git. Utilisez des variables d'environnement locales et demandez les accès secrets à l'administrateur pour la configuration GitHub Secrets.

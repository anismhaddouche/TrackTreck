# TrackTreck Test
Ce projet sert à valider la CI/CD GitHub Actions vers GHCR.

---

## Guide de Collaboration 

Pour garantir la qualité du code et la stabilité de la production, nous suivons ce flux de travail :

### 1. Initialisation
```bash
git clone https://github.com/anismhaddouche/TrackTreck.git
git checkout -b develop  # Toute modification se fait ICI
```

### 2. Développement et Tests Locaux (Docker)

Avant de pousser vos modifications, vous **devez** systématiquement tester votre code localement en utilisant la configuration Docker.

1.  **Se placer dans le dossier d'infrastructure** :
    ```bash
    cd infrastructure
    ```
2.  **Lancer le build et démarrer les services** :
    ```bash
    docker compose up -d --build
    ```
    *Le flag `--build` force la reconstruction de l'image locale avec vos dernières modifications dans `/app`.*
3.  **Vérifier le statut des containers** :
    ```bash
    docker compose ps
    ```
4.  **Consulter les logs en cas de problème** :
    ```bash
    docker compose logs -f
    ```
5.  **Accéder à l'application** : [http://localhost](http://localhost)

### 3. Règles de Collaboration (Git-Shield)

Pour garantir la qualité et la robustesse du projet :
*   **Branche Main sacrée** : Ne travaillez **jamais** directement sur `main`. Utilisez `develop` ou une branche de fonctionnalité (ex: `feat/nom-feature`).
*   **Zéro Pollution** : Ne committez **jamais** de fichiers `.env`, de clés API ou de dossiers `node_modules`.
*   **Test-First** : Une Pull Request ne sera validée que si le build Docker CI/CD (GitHub Actions) passe au vert.
*   **Documentation** : Toute nouvelle fonctionnalité doit être accompagnée d'une mise à jour de la documentation si nécessaire.


### 4. Livraison (Pull Request)
Une fois une fonctionnalité terminée :
1. Poussez votre branche : `git push origin dev`.
2. Allez sur GitHub et créez une **Pull Request (PR)** vers `main`.
3. Le build Docker CI/CD se lancera automatiquement pour vérifier votre code.
4. **Attendez la validation** de l'administrateur avant le merge.

---

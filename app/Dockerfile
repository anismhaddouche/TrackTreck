FROM nginx:alpine

# Création d'une page de test statique
RUN echo '<h1>TrackTreck Test CI/CD 🚀</h1><p>Le build Docker sur GHCR fonctionne parfaitement !</p>' > /usr/share/nginx/html/index.html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

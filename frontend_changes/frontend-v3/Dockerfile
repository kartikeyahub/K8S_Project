FROM nginx:alpine

# Replace the default Nginx site with the microservices reverse-proxy config.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the refreshed static frontend assets.
COPY index.html /usr/share/nginx/html/index.html
COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

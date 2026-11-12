# ---- Stage 1: validate the nginx config at build time ------------------------
# Renders the template with placeholder values and runs `nginx -t`, so a broken
# config fails `docker build` instead of a running container. On success it
# writes a marker file; the runtime stage copies that marker, which forces
# BuildKit to run this stage (BuildKit skips stages the final image never uses).
FROM nginxinc/nginx-unprivileged:1.27.3-alpine AS config-check
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
RUN BACKEND_HOST=localhost BACKEND_PORT=8080 NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 \
    /docker-entrypoint.sh nginx -t \
 && echo "nginx config validated at build time" > /tmp/nginx-config-ok

# ---- Stage 2: runtime ---------------------------------------------------------
# nginx-unprivileged runs as the non-root "nginx" user (uid 101) and listens on
# 8080 instead of 80. Exact tag pinned, never "latest".
FROM nginxinc/nginx-unprivileged:1.27.3-alpine AS runtime

# Default to the Compose service name; Kubernetes overrides it via a ConfigMap.
# NGINX_ENTRYPOINT_LOCAL_RESOLVERS makes the entrypoint read the DNS server
# from /etc/resolv.conf into NGINX_LOCAL_RESOLVERS for the resolver directive.
ENV BACKEND_HOST=backend \
    BACKEND_PORT=8080 \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1

# The image's entrypoint runs envsubst on /etc/nginx/templates/*.template at
# start-up and writes /etc/nginx/conf.d/default.conf.
COPY --from=config-check /tmp/nginx-config-ok /etc/nginx/config-validated
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY public/ /usr/share/nginx/html/

# Already the default in this base image, stated explicitly as required.
USER nginx
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

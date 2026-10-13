FROM alpine:3.21.0
ARG TARGETOS=linux
ARG TARGETARCH
LABEL org.opencontainers.image.source="https://github.com/nicnic-cc/refusion"

RUN apk add --no-cache su-exec && \
    addgroup -S -g 1000 fusion && adduser -S -D -H -h /fusion -G fusion -u 1000 fusion && \
    mkdir -p /data && chown -R fusion:fusion /data

WORKDIR /fusion
COPY --chown=fusion:fusion --chmod=755 build/refusion-${TARGETOS}-${TARGETARCH} ./refusion
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
EXPOSE 8080
VOLUME ["/data"]
ENV DB="/data/fusion.db"
HEALTHCHECK --interval=10s --timeout=3s --start-period=2s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/api/oidc/enabled || exit 1
ENTRYPOINT ["docker-entrypoint.sh"]
CMD [ "./refusion" ]

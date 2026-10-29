FROM php:8.3-cli
WORKDIR /app
COPY . /app
RUN chown -R www-data:www-data /app
USER www-data
ENV PORT=10000
EXPOSE 10000
CMD ["sh", "-c", "php -S 0.0.0.0:${PORT} -t /app"]

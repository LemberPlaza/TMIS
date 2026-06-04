# ======================
# Build React App
# ======================
FROM node:20-alpine AS builder

WORKDIR /app

COPY . .

RUN npm install
RUN npm run build


# ======================
# PHP + Apache
# ======================
FROM php:8.2-apache

RUN docker-php-ext-install mysqli pdo pdo_mysql

RUN a2enmod rewrite

WORKDIR /var/www/html

# Copy frontend build
COPY --from=builder /app/dist/ ./

# Copy PHP backend
COPY --from=builder /app/api ./api

# React Router support
RUN echo 'RewriteEngine On\n\
RewriteCond %{REQUEST_FILENAME} !-f\n\
RewriteCond %{REQUEST_FILENAME} !-d\n\
RewriteCond %{REQUEST_URI} !^/api/\n\
RewriteRule . /index.html [L]' > /var/www/html/.htaccess

RUN chown -R www-data:www-data /var/www/html

EXPOSE 80

CMD ["apache2-foreground"]
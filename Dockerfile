# # =========================
# # Stage 1: Build Vite App
# # =========================
# FROM node:20 AS frontend-builder

# WORKDIR /app

# # Copy package files first
# COPY package*.json ./

# # Install dependencies
# RUN npm install

# # Copy project files
# COPY . .

# # Build Vite production files
# RUN npm run build


# # =========================
# # Stage 2: PHP + Apache
# # =========================
# FROM php:8.2-apache

# # Install PHP extensions
# RUN docker-php-ext-install mysqli pdo pdo_mysql

# # Enable Apache rewrite
# RUN a2enmod rewrite

# # Set working directory
# WORKDIR /var/www/html

# # Copy PHP backend files
# COPY api ./api

# # Copy Vite build output
# COPY --from=frontend-builder /app/dist ./

# # Apache configuration for SPA routing
# RUN echo '<VirtualHost *:80>\n\
#     DocumentRoot /var/www/html\n\
#     <Directory /var/www/html>\n\
#         AllowOverride All\n\
#         Require all granted\n\
#         Options Indexes FollowSymLinks\n\
#     </Directory>\n\
# </VirtualHost>' > /etc/apache2/sites-available/000-default.conf

# # Create .htaccess for React Router
# RUN echo 'RewriteEngine On\n\
# RewriteBase /\n\
# RewriteRule ^index\\.html$ - [L]\n\
# RewriteCond %{REQUEST_FILENAME} !-f\n\
# RewriteCond %{REQUEST_FILENAME} !-d\n\
# RewriteRule . /index.html [L]' > /var/www/html/.htaccess

# # Permissions
# RUN chown -R www-data:www-data /var/www/html

# EXPOSE 80

# CMD ["apache2-foreground"]




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
RewriteRule . /index.html [L]' > /var/www/html/.htaccess

RUN chown -R www-data:www-data /var/www/html

EXPOSE 80

CMD ["apache2-foreground"]
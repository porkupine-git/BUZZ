FROM node:18-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy all other project files
COPY . .

# Hugging Face Spaces run as a non-root user (UID 1000)
# The 'node' user in the node:18-alpine image is UID 1000.
# We change ownership of the app directory to this user and switch to it.
RUN chown -R node:node /app
USER node

# Expose port (Hugging Face default is 7860)
EXPOSE 7860

# Start the application
CMD ["npm", "start"]

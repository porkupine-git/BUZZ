FROM node:18-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy all other project files
COPY . .

# Expose port (Hugging Face default is 7860)
EXPOSE 7860

# Start the application
CMD ["npm", "start"]

FROM node:4.4.7-wheezy

ADD . /src
WORKDIR /src
RUN npm install
CMD ["npm", "start"]
# TaxiRouter SG

![](screenshots/screenshot-3.jpg)

**TaxiRouter SG** is a web app that lets you explore available taxis and taxi stands in Singapore. Period.

It has very little number of features:

- List all taxi stands in Singapore.
- Shows all available taxis in the whole Singapore.
- Tells how many available taxis around you.
- Tells how far is the nearest taxi stand around you.

That's it.

## Story

This project is [first inspired](https://twitter.com/cheeaun/status/710632610607726592) by [@uzyn](https://github.com/uzyn)'s project: [Singapore Taxi Data Visualization](http://uzyn.github.io/taxisg/). Also following up from his talk on FOSS Asia 2016: [Uncovering of an obfuscated public governmental API ](https://speakerdeck.com/uzyn/uncovering-of-an-obfuscated-public-governmental-api-foss-asia-2016). Later, [Data.gov.sg](https://data.gov.sg/) releases a new [taxi availability API](https://developers.data.gov.sg/transport/taxi-availability) and that marks the beginning of this project.

Read more:

- Building TaxiRouter SG https://cheeaun.com/blog/2016/03/building-taxirouter-sg/
- Rebuilding TaxiRouter SG https://cheeaun.com/blog/2018/04/rebuilding-taxirouter-sg/

## Bragging

🎤 I gave [a talk about it](https://engineers.sg/video/taxi-router-talk-js--737) on [Singapore JS Meetup](https://www.meetup.com/Singapore-JS/events/231037529/).

🌟 Featured on [Digital News Asia](https://www.digitalnewsasia.com/digital-economy/datasets-rest-us-datagovsg), [Channel 8 News](https://www.youtube.com/watch?v=8zH8fbUNdKI) and [GovTech conference](https://twitter.com/heliumlife/status/784217428410544128).

## Technicalities

### Data

- Download "LTA Taxi Stop" data from https://data.gov.sg/dataset/lta-taxi-stop
- Extract the GeoJSON file to `data/lta-taxi-stop-geojson.geojson` (assuming the file name is still the same).
- Run `npm run taxi-stands` to (re)generate `data/taxi-stands.json`, to be used by the web app

### Development

- `npm i` - install everything
- `npm start` - runs a local development server
- `npm run start-https` - runs a local development server with HTTPS
- `npm run build` - builds the production assets for deployment

## License

Data: © [Land Transport Authority](http://www.lta.gov.sg/)

Everything else: [MIT](http://cheeaun.mit-license.org/)

const admin = require('firebase-admin');
const request = require("request-promise");
const format = require('date-format');
const COVID_BASE_API = 'https://covid-api.com/api';
const REGIONS_BASE_API = `${COVID_BASE_API}/regions`;
const STATES_BASE_API = `${COVID_BASE_API}/provinces`;
const REPORTS_BASE_API = `${COVID_BASE_API}/reports`;
let messagingInitialized = false;
let messagingCredentials = '';

async function getRegions() {
    let url = REGIONS_BASE_API;

    let result = JSON.parse(await request.get(url));
    console.log('Received regions from covid api');
    return result.data;
}

async function getStates(regionIso) {
    let url = `${STATES_BASE_API}/${regionIso}`;

    let result = JSON.parse(await request.get(url));
    console.log('Received states from covid api');
    return result.data;
}

async function getStateReport(date, regionName, regionProvince) {
    let formattedDate = format('yyyy-MM-dd', date);
    let url = `${REPORTS_BASE_API}?date=${formattedDate}&region_name=${encodeURI(regionName)}&region_province=${encodeURI(regionProvince)}`;

    let result = JSON.parse(await request.get(url));
    console.log('Received state reports from covid api');
    return result.data;
}

function generateStateMessage(stateReport) {
    let topic = `${encodeURI(stateReport.region.name)}_${encodeURI(stateReport.region.province)}`;
    return {
        notification: {
            title: `Latest COVID-19 Cases for ${stateReport.region.province}`,
            body: `${stateReport.region.province} has ${stateReport.confirmed} confirmed cases of COVID-19 as of ${stateReport.date}, which is a difference of ${stateReport.confirmed_diff} from the previous day.`
        },
        data: {
            name: stateReport.region.name,
            province: stateReport.region.province,
            date: stateReport.date
        },
        topic: topic
    };
}

function initializeMessaging() {
    if (!messagingInitialized) {
        admin.initializeApp({
            credential: admin.credential.cert(messagingCredentials)
        });
        messagingInitialized = true;
    }
}

async function sendMessages(messages) {
    try {
        initializeMessaging();
        console.log('Sending messages...');
        // Send messages to devices subscribed to the provided topic.
        response = await admin.messaging().sendAll(messages)
        // Response is the success count
        console.log('Successfully sent messages:', response);
        return response;
    } catch (error) {
        console.log('Error sending messages:', error);
    }
}

async function main(args) {
    try {
        messagingCredentials = args.GOOGLE_APPLICATION_CREDENTIALS;

        let regions = await getRegions();
        if (regions.length <= 0) {
            return { error: 'No regions found'};
        }

        let theRegion = regions.find(region => region.name.toUpperCase() === args.COUNTRY.toUpperCase());
        let regionName = theRegion.name;
        let regionIso = theRegion.iso;

        let states = await getStates(regionIso);
        if (states.length <= 0) {
            return { error: 'No states found'};
        }

        let date = new Date();
        date.setDate(date.getDate() - 1);

        let messages = [];
        for (const state of states) {
            let regionProvince = state.province;
            let result = await getStateReport(date, regionName, regionProvince);
            console.log('Received result from covid api');
            if (result.length > 0) {
                let stateReport = result[0];
                let message = generateStateMessage(stateReport);
                messages.push(message);
            }
        }
        if (messages.length > 0) {
            await sendMessages(messages);
            return { messages: messages };
        } else {
            return { error: 'No reports found'};
        }
    } catch (error) {
        return { error: 'Error loading reports: ' + error};
    }
}

exports.main = main;
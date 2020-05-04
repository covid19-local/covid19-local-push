const admin = require('firebase-admin');
const request = require("request-promise");
const format = require('date-format');
const COVID_BASE_API = 'https://covid-api.com/api';
const REGIONS_BASE_API = `${COVID_BASE_API}/regions`;
const STATES_BASE_API = `${COVID_BASE_API}/provinces`;
const REPORTS_BASE_API = `${COVID_BASE_API}/reports`;
const MAX_MESSAGE_BATCH_COUNT = 500;
let messagingInitialized = false;
let messagingCredentials = '';
let sendMessagesInBatches = true;
let dateOffset = 1;

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
    console.log(`Received state reports for ${regionProvince}, ${regionName} from covid api`);
    return result.data;
}

function generateTopic(arguments) {
    let topic = '';
    for (const argument of arguments) {
        topic += `${encodeURI(argument).replace("'", '').replace('(', '').replace(')', '')}_`;
    }
    if (topic.length > 0) {
        topic = topic.substring(0, topic.lastIndexOf('_'));
    }
    return topic;
}

function generateStateMessage(stateReport) {
    let topic = generateTopic([stateReport.region.name, stateReport.region.province]);
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

function generateCityMessage(stateReport, cityReport) {
    let topic = generateTopic([stateReport.region.name, stateReport.region.province, cityReport.name]);
    return {
        notification: {
            title: `Latest COVID-19 Cases for ${cityReport.name}, ${stateReport.region.province}`,
            body: `${cityReport.name}, ${stateReport.region.province} has ${cityReport.confirmed} confirmed cases of COVID-19 as of ${cityReport.date}, which is a difference of ${cityReport.confirmed_diff} from the previous day.`
        },
        data: {
            name: stateReport.region.name,
            province: stateReport.region.province,
            city: cityReport.name,
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

async function sendMessageBatch(messageBatch) {
    initializeMessaging();
    // Send messages to devices subscribed to the provided topic.
    response = await admin.messaging().sendAll(messageBatch)
    // Response is the success count
    return response;
}

async function sendMessage(message) {
    initializeMessaging();
    // Send message to devices subscribed to the provided topic.
    response = await admin.messaging().send(message)
    // Response is the id
    return response;
}

async function sendMessages(messages) {
    responses = [];
    if (sendMessagesInBatches) {
        messageBatches = [];
        if (messages <= MAX_MESSAGE_BATCH_COUNT) {
            messageBatches.push(messages);
        } else {
            let batchCount = Math.ceil(messages.length / MAX_MESSAGE_BATCH_COUNT);
            for (let index = 0; index < batchCount; index++) {
                let startIndex = index * MAX_MESSAGE_BATCH_COUNT;
                let endIndex = startIndex + MAX_MESSAGE_BATCH_COUNT;
                if (endIndex > messages.length) {
                    endIndex = messages.length;
                }
                messageBatches.push(messages.slice(startIndex, endIndex)); 
            }
        }
        for (const messageBatch of messageBatches){ 
            try {
                console.log('Sending messages...');
                response = await sendMessageBatch(messageBatch);
                console.log('Successfully sent messages:', response);
                responses.push(response);
            } catch (error) {
                console.log('Error sending messages:', error);
            }
        }
    } else {
        for (const message of messages) {
            try {
                console.log('Sending message...');
                response = await sendMessage(message);
                console.log('Successfully sent message:', response);
                responses.push(response);
            } catch (error) {
                console.log('Error sending messages:', error);
            }
        }
    }
    return responses;
}

async function main(args) {
    try {
        messagingCredentials = args.GOOGLE_APPLICATION_CREDENTIALS;
        dateOffset = parseInt(args.DATE_OFFSET);

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
        date.setDate(date.getDate() - dateOffset);

        let messages = [];
        for (const state of states) {
            let regionProvince = state.province;
            let result = await getStateReport(date, regionName, regionProvince);
            if (result.length > 0) {
                let stateReport = result[0];
                let message = generateStateMessage(stateReport);
                messages.push(message);

                for (const cityReport of stateReport.region.cities) {
                    message = generateCityMessage(stateReport, cityReport);
                    messages.push(message);
                }
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
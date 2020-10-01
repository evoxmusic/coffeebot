// The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const functions = require('firebase-functions');

// The Firebase Admin SDK to access Cloud Firestore.
const admin = require('firebase-admin');
admin.initializeApp();

const { DateTime } = require("luxon");

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
// exports.helloWorld = functions.https.onRequest((request, response) => {
//   functions.logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
const key = "qYe4VZgQMhsAzxqJzmFCJjZi4tVsznq2ogcN3HTm";
const MAX_COFFEE_ADD = 5;
const COUNT_DISPLAY_SIZE = 5;

function countCoffeesPerUser(data) {
    return data.coffeeTimes.reduce(
        (acc, val) => {
            acc[val.user_name] = acc[val.user_name] ? acc[val.user_name] + 1 : 1;
            return acc;
        }
    , {})
}

async function showHelp(req, res) {
    res.json({
        "response_type": "ephemeral",
        "text": `Ohai, and welcome to coffeebot. Coffeebot counts the coffees consumed by Common Coders because why not.

        The most important commands are:

        - \`/coffee help\` - You found this already
        - \`/coffee\` - add a single coffee
        - \`/coffee <number>\` - add multiple coffees, max 5; but try to use /coffee when you get a coffee instead
        - \`/coffee count\` - show the total number of coffees, and highest 5 coffee consumers
        - \`/coffee count-all\` - show the total number of coffees, and _all_ coffee consumers`
    })
}

async function showCoffeeCount(req, res, numOfItems) {
    var dt = DateTime.local().setZone("Australia/Melbourne");

    const drinkTimesQuery = admin.firestore().collection('drinks-per-day').doc(dt.toISODate());
    const doc = await drinkTimesQuery.get();

    let data = {}
    if (!doc.exists) {
        data = {coffeeTimes: []}
    } else {
        data = doc.data();
    }

    const totalCoffeeCount = data.coffeeTimes.length
    const userCoffees = countCoffeesPerUser(data)

    const sortedUserCoffeeCount = Object.entries(userCoffees).sort((a, b) => { return a[1] - b[1] })
    let blocks = []
    let textChunks = []

    itemsToShow = numOfItems ? Math.min(numOfItems, sortedUserCoffeeCount.length) : sortedUserCoffeeCount.length;

    for (let idx=0, len=itemsToShow; idx < len; idx++) {
        textChunks.unshift(`- _${sortedUserCoffeeCount[idx][0]}_ has consumed ${sortedUserCoffeeCount[idx][1]} coffees`)
    }

    if (textChunks.length > 0) {
        blocks.unshift({
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": textChunks.join("\n")
            }
        })
    }


    blocks.unshift(
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": `*Today*, Common Coders have consumed ${totalCoffeeCount} coffees`
            }
        },
    )

    res.json({
        "response_type": "in_channel",
        "blocks": blocks
    });
}

async function addCoffee(req, res, inc) {

    if (inc > MAX_COFFEE_ADD) {
        res.json({
            "response_type": "ephemeral",
            "text": "You can't add more than 5 coffees at a time"
        })
        return
    }

    var dt = DateTime.local().setZone("Australia/Melbourne");

    const drinkTimesQuery = admin.firestore().collection('drinks-per-day').doc(dt.toISODate());
    const doc = await drinkTimesQuery.get();

    newCoffeeTimes = []
    for (let idx=0; idx<inc; idx++) {
        newCoffeeTimes.unshift(
            {
                timestamp: dt.toJSDate(),
                user_name: req.body.user_name,
                user_id: req.body.user_id
            }
        )
    }

    let data = {}
    if (!doc.exists) {
        data = {
            timestamp: dt.set({ hour: 0, minute: 0, second: 0, millisecond: 0}).toJSDate(),
            coffeeTimes: newCoffeeTimes
        };
    } else {
        data = doc.data();
        data.timestamp = data.timestamp || dt.set({ hour: 0, minute: 0, second: 0, millisecond: 0}).toJSDate(),
        data.coffeeTimes = data.coffeeTimes || [];
        data.coffeeTimes = [...data.coffeeTimes, ...newCoffeeTimes]
    }
    await drinkTimesQuery.set(data)

    const totalCoffeeCount = data.coffeeTimes.length
    const userCoffees = countCoffeesPerUser(data)

    res.json({
        "response_type": "ephemeral",
        "text": `That's coffee number ${userCoffees[req.body.user_name]} for you today, and number ${totalCoffeeCount} for CC today`
    })
}

exports.coffeeBot = functions.https.onRequest(async (req, res) => {
    if (req.query.key !== key) {
        res.json({result: "nope"})
        return
    }

    if (req.body.command !== "/coffee") {
        res.json({"response_type": "ephemeral", "text": "Something has gone horribly wrong"});
        return;
    }

    // render
    if (req.body.text === "help") {
        await showHelp(req, res);
        return;
    } else if (req.body.text === "count") {
        await showCoffeeCount(req, res, COUNT_DISPLAY_SIZE);
        return;
    } else if (req.body.text === "count-all") {
        await showCoffeeCount(req, res, null);
        return;
    } else if (!isNaN(parseInt(req.body.text, 10))) {
        await addCoffee(req, res, parseInt(req.body.text, 10));
        return;
    } else if (req.body.text === "") {
        await addCoffee(req, res, 1);
        return;
    } else {
        res.json({"response_type": "ephemeral", "text": "Something has gone horribly wrong"});
        return
    }
  });

// Try to keep the bot warm so it doesn't time out
exports.batchiePot = functions.pubsub.schedule('every 5 minutes').onRun((context) => {
    console.log('Just keeping things warm.');
    return null;
});

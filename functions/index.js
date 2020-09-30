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
const key = "qYe4VZgQMhsAzxqJzmFCJjZi4tVsznq2ogcN3HTm"

function countCoffeesPerUser(data) {
    return data.coffeeTimes.reduce(
        (acc, val) => {
            acc[val.user_name] = acc[val.user_name] ? acc[val.user_name] + 1 : 1;
            return acc;
        }
    , {})
}

async function showCoffeeCount(req, res) {
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

    const sortedUserCoffeeCount = Object.entries(userCoffees).sort((a, b) => { return b[1] - a[1] })
    let blocks = []
    for (let idx=0, len=Math.min(sortedUserCoffeeCount.length, 5); idx < len; idx++) {
        blocks.unshift({
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": `_${sortedUserCoffeeCount[idx][0]}_ has consumed ${sortedUserCoffeeCount[idx][1]} coffees`
            }
        })
    }
    blocks.unshift(
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": `*Today, Common Coders have consumed ${totalCoffeeCount} coffees`
            }
        },
    )

    res.json({
        "response_type": "in_channel",
        "blocks": blocks
    });
}

async function addCoffee(req, res) {
    var dt = DateTime.local().setZone("Australia/Melbourne");

    const drinkTimesQuery = admin.firestore().collection('drinks-per-day').doc(dt.toISODate());
    const doc = await drinkTimesQuery.get();

    let data = {}
    if (!doc.exists) {
        data = {
            coffeeTimes: [
                {
                    timestamp: dt.toJSDate(),
                    user_name: req.body.user_name,
                    user_id: req.body.user_id
                }
            ]
        };
    } else {
        data = doc.data();
        data.coffeeTimes = data.coffeeTimes || [];
        data.coffeeTimes.push(
            {
                timestamp: dt.toJSDate(),
                user_name: req.body.user_name,
                user_id: req.body.user_id
            }
        )
    }
    await drinkTimesQuery.set(data)

    const totalCoffeeCount = data.coffeeTimes.length
    const userCoffees = countCoffeesPerUser(data)

    res.json({
        "response_type": "ephemeral",
        "text": `That's coffee number ${userCoffees[req.body.user_name]} for you, and number ${totalCoffeeCount} for CC today`
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

    switch (req.body.text) {
        case "":
            await addCoffee(req, res);
            return;
        case "count":
            await showCoffeeCount(req, res);
            return;
        default:
            res.json({"response_type": "ephemeral", "text": "Something has gone horribly wrong"});
            return
    }
  });

const { Telegraf, Markup, session } = require('telegraf');
const axios = require("axios");
const fs = require("fs");
require('dotenv').config()

const bot = new Telegraf(process.env.BOT_TOKEN);
const host = "https://cdn-api.co-vin.in/api/v2";

const filePath = process.env.BOT_DB_PATH

const emoji = {
    Cash: '\u{1F4B5}',
    Free: '\u{1F193}',
    Pup: '\u{1F436}',
    Clock: '\u{1F553}',
    Check: '\u{2705}',
    Cross: '\u{274C}',
}

const userFileName = filePath + 'users.json';
const districtFileName = filePath + 'districts.json';
const districtDataFileName = filePath + 'districtsData.json';

const POLLING_INTERVAL = parseInt(process.env.POLLING_INTERVAL);
const BUCKET_SIZE = parseInt(process.env.BUCKET_SIZE);
const BACKOFF_MULTIPLIER = parseInt(process.env.BACKOFF_MULTIPLIER);
const API_BUCKET_SIZE = parseInt(process.env.API_BUCKET_SIZE);

const botCommandList = [
    {
        command: 'add',
        description: 'Add a district and age group to get notified.'
    },
    {
        command: 'reset',
        description: 'Remove all registered districts.'
    },
    {
        command: 'stop',
        description: 'Stop receiving updates from me.'
    }
]

bot.start((ctx) => { 
    bot.telegram.sendMessage(ctx.chat.id, `Hello ${ctx.chat.first_name} welcome to CovidIndiaVaccineBot, I will send you details about current available vaccination slots in your area and notify you when there are changes in the availability of those slots.`);
    fetchState(ctx);
    jsonAddUserData(ctx.from.id, ctx.chat.first_name);
})

bot.telegram.setMyCommands(botCommandList);

bot.hears('/add', (ctx) => {
    fetchState(ctx);
})

bot.hears('/reset', (ctx) => {
    bot.telegram.sendMessage(ctx.chat.id, 'Are you sure you want to remove all your preferences?', requestConfirmation)
})

bot.hears('/stop', (ctx) => {
    bot.telegram.sendMessage(ctx.chat.id, 'Are you sure you want to stop receiving updates from me?', requestConfirmation)
})

bot.action('YesResetConfirmation', (ctx) => {
    removeUserFromAllDistricts(ctx.from.id);
    bot.telegram.sendMessage(ctx.chat.id, `You have unsubscribed. I hope I was helpful. ${emoji.Pup}`);
    bot.telegram.editMessageReplyMarkup(ctx.chat.id, ctx.update.callback_query.message.message_id, undefined, {"reply_markup": null})
})

bot.action('NoResetConfirmation', (ctx) => {
    bot.telegram.editMessageReplyMarkup(ctx.chat.id, ctx.update.callback_query.message.message_id, undefined, {"reply_markup": null})
})

bot.use(session())

const fetchDistrict = async (ctx, stateId) => {
    try {
        await axios.get(`${host}/admin/location/districts/${stateId}`)
          .then((response) => getUserDistrict(ctx, response.data.districts))
    } catch (e) {
        console.log(e);
    }
}

const fetchState = async (ctx) => {
    try {
      await axios.get(`${host}/admin/location/states`)
        .then((response) => getUserState(ctx, response.data.states))
    } catch (e) {
      console.log(e);
    }
}

const requestAgeGroup = {
    "reply_markup": {
        "one_time_keyboard": true,
        "keyboard": [
            [{
                text: "18 to 45",
                one_time_keyboard: true,
            }],
            [{
                text: "45+",
                one_time_keyboard: true,
            }],
            [{
                text: "Both",
                one_time_keyboard: true,
            }],
            ["Cancel"]
        ]
    }
};

const requestConfirmation = {
    "reply_markup": {
        "inline_keyboard": [
            [
                {
                    "text": 'Yes',
                    "callback_data": 'YesResetConfirmation',
                },
                {
                    "text": 'No',
                    "callback_data": 'NoResetConfirmation',
                }
            ]
        ]
    }
}

const generateUserData = (userName, districtId, ageGroup) => {
    return districtId ? 
    {
        userName: userName,
        districtId: [districtId],
        ageGroup: ageGroup,
    } : {
        userName: userName,
        districtId: [],
        ageGroup: ageGroup,
    }
}

const getAgeGroup = (ctx) => {
    bot.telegram.sendMessage(ctx.chat.id, 'Select the age group', requestAgeGroup)

    bot.hears('18 to 45', ctx => {
        bot.telegram.sendMessage(ctx.chat.id, 'Selected age group is 18 to 45', removeKeyboard);
        jsonAddDistrict(ctx, "lowerAge");
    })
    
    bot.hears('45+', ctx => {
        bot.telegram.sendMessage(ctx.chat.id, 'Selected age group is 45+', removeKeyboard);
        jsonAddDistrict(ctx, "upperAge");
    })
    
    bot.hears('Both', ctx => {
        bot.telegram.sendMessage(ctx.chat.id, 'Selected age group is both 18 to 45 and 45+', removeKeyboard);
        jsonAddDistrict(ctx, "bothAge");
    })  
}

const getUserDistrict = (ctx, districts) => {
    const requestDistrict = {
        reply_markup: {
            keyboard: districts.map((district) => {return [{ text: district.district_name }]})
        }
    }
    bot.telegram.sendMessage(ctx.chat.id, 'Select the District', requestDistrict)

    districts.forEach(district => {
        bot.hears(district.district_name, ctx => {
            ctx.session = { districtId: district.district_id };
            // jsonAddUser(ctx.from.id, userData);
            getAgeGroup(ctx);
        })
    });
}

const getUserState = (ctx, states) => {
    const requestState = {
        reply_markup: {
            keyboard: states.map((state) => {return [{ text: state.state_name }]})
        }
    }
    bot.telegram.sendMessage(ctx.chat.id, 'Select the State', requestState)

    states.forEach(state => {
        bot.hears(state.state_name, ctx => {
            fetchDistrict(ctx, state.state_id);
        })
    });
}

const removeKeyboard = {
    "reply_markup": {
        "remove_keyboard": true
    }
}

const replyParseMode = {
    "parse_mode": "HTML"
}

const getCurrentDate = () => {
    var now = new Date();
    var dd = String(now.getDate()).padStart(2, '0');
    var mm = String(now.getMonth() + 1).padStart(2, '0'); //January is 0!
    var yyyy = now.getFullYear();
    return  dd + '-' + mm + '-' + yyyy;
}

const generateCenterMessage = (centerData) => 
    `<b>Name : ${centerData.name}</b> \n` +
    `Minimum age : ${centerData.min_age_limit} \n` +
    `<b>Available capacity : ${centerData.available_capacity}</b> ${centerData.available_capacity > 0 ? emoji.Check : emoji.Cross} \n` + 
    `Block name : ${centerData.block_name} \n` +
    `Pin code : ${centerData.pincode} \n` +
    `Fee : ${centerData.fee} ${centerData.fee > 0 ? emoji.Cash : emoji.Free}\n` + 
    `Vaccine type : ${centerData.vaccine} \n` + 
    `Date : ${centerData.date} \n`

const getDistrictDataFromFile = () => {
    const districtsFromFile = fs.readFileSync(districtDataFileName, { encoding: 'utf8' });
    return JSON.parse(districtsFromFile)
}

const getDistrictDataByIdFromFile = (districtId) => {
    const districtData = getDistrictDataFromFile();
    return districtData[districtId];
}

const sendDistrictDataToUserByAge = (ctx, districtData, ageGroup) => {
    districtData.sessions.map((session, idx) => {
        if ((ageGroup === "upperAge" && session.min_age_limit === 45) || 
            (ageGroup === "lowerAge" && session.min_age_limit === 18) || 
            (ageGroup === "bothAge")) {
            setTimeout(() => bot.telegram.sendMessage(
                ctx.chat.id,
                generateCenterMessage(session),
                replyParseMode
            ), Math.floor(idx/BUCKET_SIZE) * BACKOFF_MULTIPLIER)
             
        }
    })

    if (districtData.sessions.length === 0 || 
        (ageGroup === "upperAge" && !districtData.sessions.find((session) => session.min_age_limit === 45)) ||
        (ageGroup === "lowerAge" && !districtData.sessions.find((session) => session.min_age_limit === 18))) {
        bot.telegram.sendMessage(ctx.chat.id, "There were no vaccination centers available for the parameters selected by you. I will update you once there are any changes in the availability (This bot is still in testing, please don't rely only on this bot for updates).");
    }
}

const setDistrictDataByIdToFile = (districtId, data) => {
    const districtData = getDistrictDataFromFile();
    const newDistrictData = { ...districtData, [districtId]: data }
    fs.writeFileSync(districtDataFileName, JSON.stringify(newDistrictData))
}

const setDistritUserDataToFile = (newDistrictUserData) => {
    fs.writeFileSync(districtFileName, JSON.stringify(newDistrictUserData))
}

const fetchDistrictData = async (ctx, ageGroup, districtId) => {
    const districtDataById = getDistrictDataByIdFromFile(districtId);
    if (districtDataById) {
        sendDistrictDataToUserByAge(ctx, districtDataById, ageGroup);
        return;
    }
    
    const todayDateFormat = getCurrentDate();
    bot.telegram.sendMessage(ctx.chat.id, 'Here are all the available centers in your district:')
    console.log(`Fetching data for district : ${districtId}`);
    try {
        await axios.get(`${host}/appointment/sessions/public/findByDistrict?district_id=${districtId}&date=${todayDateFormat}`)
            .then((response) => {
                sendDistrictDataToUserByAge(ctx, response.data, ageGroup)
                setDistrictDataByIdToFile(districtId, response.data);
            })
    } catch (err) {
        console.log(err)
    }
}

const jsonAddUserData = (userId, userName) => {
    try {
        const fileUserData = fs.readFileSync(userFileName, { encoding: 'utf8' });
        const userData = JSON.parse(fileUserData);

        if (!(userId in userData)) {
            const newUserData = { ...userData, [userId]: userName }
            fs.writeFileSync(userFileName, JSON.stringify(newUserData));
        }

    } catch (e) {
        console.log(e);
    }
}

const jsonAddDistrict = (ctx, ageGroup) => {
    try {
        const fileDistrictDataResponse = fs.readFileSync(districtFileName, { encoding: 'utf8' });
        const fileDistrictData = JSON.parse(fileDistrictDataResponse);

        const { districtId } = ctx.session;
        const userId = ctx.from.id;
        const newDistrictData = { ...fileDistrictData }
        if (!(districtId in newDistrictData)) {
            newDistrictData[districtId] = {
                lowerAge : [],
                upperAge : [],
                bothAge : [],
            }
        };

        if(newDistrictData[districtId][ageGroup].indexOf(userId) === -1) {
            newDistrictData[districtId][ageGroup].push(userId);
        }

        console.log(`Adding user : ${userId} to district : ${districtId}`)
        fs.writeFileSync(districtFileName, JSON.stringify(newDistrictData));
           
        bot.telegram.sendMessage(ctx.chat.id, 'Thank you for adding your preferences. I will notify you when a vaccination slot is available in your area.');
        fetchDistrictData(ctx, ageGroup, districtId);
    }
    catch (err) {
        console.log(err);
    }
}

const getUsersForAllDistrict = () => {
    const fileDistrictData = fs.readFileSync(districtFileName, { encoding: 'utf8' });
    return JSON.parse(fileDistrictData);
}

const getUsersForDistrict = (districtId) => {
    const fileDistrictData = fs.readFileSync(districtFileName, { encoding: 'utf8' });
    const districtData = JSON.parse(fileDistrictData);

    return districtData[districtId]
}

const checkForUpdates = (districtId, oldData, newData) => {
    let updateData = false;
    const districtUserData = getUsersForDistrict(districtId);

    newData.sessions.forEach((newCenter) => {
        const { center_id } = newCenter;
        const oldCenter = oldData.sessions.find((oldCenter) => oldCenter.center_id === center_id)
        if ((newCenter.available_capacity >= 10) && 
            ((oldCenter && (
                (oldCenter.available_capacity === 0) || 
                oldCenter.min_age_limit !== newCenter.min_age_limit || 
                oldCenter.date !== newCenter.date
            )) || !oldCenter
            )
        ) {
            updateData = true;
            if (districtUserData) {
                let usersToUpdate = [];
                districtUserData["bothAge"].forEach((user) => usersToUpdate.push(user));

                if ( newCenter.min_age_limit === 18) {
                    districtUserData["lowerAge"].forEach((user) => usersToUpdate.push(user))
                } else if ( newCenter.min_age_limit === 45) {
                    districtUserData["upperAge"].forEach((user) => usersToUpdate.push(user))
                }

                usersToUpdate.forEach((userId, idx) => {
                    setTimeout(() => {
                        console.log(`Sending message to user : ${userId} for center : ${center_id}`)
                        try {
                            bot.telegram.sendMessage(userId, generateCenterMessage(newCenter), replyParseMode)
                        } catch (e) {
                            console.log(e.message)
                        }
                    }, Math.floor(idx/BUCKET_SIZE) * BACKOFF_MULTIPLIER) 
                })
            }
        }
    })

    return updateData;
}

const getAllDistrictData = () => {
    const districtData = getDistrictDataFromFile();
    const API_BACKOFF_MULTIPLIER_NEW = POLLING_INTERVAL/(Object.keys(districtData).length/API_BUCKET_SIZE);

    Object.keys(districtData).forEach(async (districtId, idx) => {
        const todayDateFormat = getCurrentDate();
        setTimeout(() => {
            console.log(`Fetching data for district : ${districtId}`);
            axios.get(`${host}/appointment/sessions/public/findByDistrict?district_id=${districtId}&date=${todayDateFormat}`)
                .then((response) => {
                    const updateData = checkForUpdates(districtId, districtData[districtId], response.data)
                    if (updateData) {
                        console.log(`Updating district data file for district : ${districtId}`)
                        setDistrictDataByIdToFile(districtId, response.data);
                    }
                })
                .catch((e) => console.log(e))},
            Math.floor(idx/API_BUCKET_SIZE) * API_BACKOFF_MULTIPLIER_NEW
        );
    })
}

const poll = async ({ fn, interval }) => {  
    const executePoll = async (resolve, reject) => {
        console.log("*****POLLING*****");
        const result = await fn();
        setTimeout(executePoll, interval, resolve, reject);
    }

    return new Promise(executePoll);
};

poll({fn: getAllDistrictData, interval: POLLING_INTERVAL});

const removeUserFromAllDistricts = (userId) => {
    const districtData = getUsersForAllDistrict();
    const newDistrictData = { ...districtData };
    Object.keys(districtData).forEach((districtId) => {
        Object.keys(districtData[districtId]).forEach((ageGroup) => {
            const index = newDistrictData[districtId][ageGroup].indexOf(userId);
            if (index > -1) {
                newDistrictData[districtId][ageGroup].splice(index, 1)
            }
        })
    })

    console.log(`Removing user : ${userId} from all districts`);
    setDistritUserDataToFile(newDistrictData);
}

bot.launch()

// process.once('SIGINT', () => bot.stop('SIGINT'))
// process.once('SIGTERM', () => bot.stop('SIGTERM'))

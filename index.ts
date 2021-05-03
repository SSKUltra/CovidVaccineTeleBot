const { Telegraf, Markup, session } = require('telegraf');
const axios = require("axios");
const fs = require("fs");
require('dotenv').config()

const bot = new Telegraf(process.env.TOKEN);
const host = "https://cdn-api.co-vin.in/api/v2";

bot.start((ctx) => {
    bot.telegram.sendMessage(ctx.chat.id, `Hello ${ctx.chat.first_name} welcome to CovidIndiaVaccineBot, I will send you details about current available vaccination slots in your area and notify you when there are changes in the availability of those slots.`);
    fetchState(ctx);
})
            
bot.hears('/help', ctx => {
    bot.telegram.sendMessage(ctx.chat.id, `Hello ${ctx.chat.first_name}, here are the list of commands available for you to use:\n /help -> Gets help.\n /getcurrentdata -> Gets current vaccine availability for the preferences set by you.\n /addregion -> Allows you to additional regions.`);
})
            
bot.hears('/addregion', ctx => {
    bot.telegram.sendMessage(ctx.chat.id, "Please select the details of the region to be added:");
    fetchState(ctx);
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
    bot.telegram.sendMessage(ctx.chat.id, 'Select the age group to check for vaccine availability', requestAgeGroup)

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
            console.log(`getUserDistrict: ${district.district_id}`);
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

const fetchDistrictData = async (ctx, ageGroup, districtId) => {
    var now = new Date();
    var dd = String(now.getDate()).padStart(2, '0');
    var mm = String(now.getMonth() + 1).padStart(2, '0'); //January is 0!
    var yyyy = now.getFullYear();
    const todayDateFormat = dd + '-' + mm + '-' + yyyy;

    bot.telegram.sendMessage(ctx.chat.id, 'Here are all the available centers in the district selected by you:')
    try {
        await axios.get(`${host}/appointment/sessions/public/findByDistrict?district_id=${districtId}&date=${todayDateFormat}`)
            .then((response) => {
                response.data.sessions.map((session) => {
                    if ((ageGroup === "upperAge" && session.min_age_limit === 45) || 
                        (ageGroup === "lowerAge" && session.min_age_limit === 18) || 
                        (ageGroup === "bothAge")) {
                        bot.telegram.sendMessage(
                            ctx.chat.id,
                            `\nName : ${session.name} \n` +
                            `Minimum age : ${session.min_age_limit} \n` +
                            `Available capacity : ${session.available_capacity} \n` + 
                            `Block name : ${session.block_name} \n` +
                            `Pin code : ${session.pincode} \n` +
                            `Fee type : ${session.fee_type} \n` + 
                            `Fee : ${session.fee} \n` + 
                            `Vaccine type : ${session.vaccine} \n` + 
                            `Date : ${session.date} \n` +
                            `Slots : ${session.slots.map((slot) => `\n\t -> ${slot}`)} \n`
                        ) 
                    }
                })

                if (response.data.sessions.length === 0 || 
                    (ageGroup === "upperAge" && !response.data.sessions.find((session) => session.min_age_limit === 45)) ||
                    (ageGroup === "lowerAge" && !response.data.sessions.find((session) => session.min_age_limit === 15))) {
                    bot.telegram.sendMessage(ctx.chat.id, "There was no vaccination centers available for the parameters selected by you. I will update you once there are any changes in the availability (This bot is still in testing, please don't rely only on this bot for updates).");
                }
            })
    } catch (err) {
        console.log(err)
    }
}

const jsonAddDistrict = (ctx, ageGroup) => {
    try {
        const fileDistrictDataResponse = fs.readFileSync('districts.json', { encoding: 'utf8' });
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

        fs.writeFileSync('districts.json', JSON.stringify(newDistrictData));
        
        bot.telegram.sendMessage(ctx.chat.id, 'Thank you for adding your preferences. I will notify you when a vaccination slot is available in your area. If you wish to see all the current available slots for your area, use the /getcurrentdata command. To get help use the /help command.');
                
        bot.hears('/getcurrentdata', ctx => {
            fetchDistrictData(ctx, ageGroup, districtId);
        })
    }
    catch (err) {
        console.log(err);
    }
}

bot.launch()

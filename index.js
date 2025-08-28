import 'dotenv/config';
import {Agent, Runner, tool} from '@openai/agents'
import {z} from 'zod'
import {chromium} from 'playwright'
import fs from "fs";
import path from "path";
import readline from "readline"
import chalk from 'chalk';
import { logWithIcon } from './utility/icons.js';

const browser = await chromium.launch({
    headless: false,
    chromiumSandbox: true,
    env : {},
    args: ['--disable-extensions', '--disable-file-system'],

})

const page = await browser.newPage();


const openBrowser = tool({
    name:'open_browser',
    description:"This tool take a site url and open it in a tab in browser",
    parameters: z.object({
        url : z.string().describe('website url which is given from user')
    }),
    async execute(input) {
        console.log(input.url)
        page.goto(input.url,{ waitUntil: "networkidle" })
    }
})

const takeScreenShot = tool({
    name : 'take_screenshot',
    description : 'This tool will take screenshot, arranging in orders and return filename and base64 format.',
    parameters: z.object({}),
    async execute(){

        const screenshotsDir = path.join(process.cwd(), "screenshots");

        if (!fs.existsSync(screenshotsDir)) {
        fs.mkdirSync(screenshotsDir, { recursive: true });
        }

        const fileName = `screenshot-${Date.now()}.png`;
        const filePath = path.join(screenshotsDir, fileName);

        // Take screenshot as Buffer
        const buffer = page.screenshot({ path: filePath, fullPage: false});


        return {
            fileName,
            base64Image : `data:image/png;base64,${buffer.toString("base64")}`
        };
    }
})

const scrollScreen = tool({
    name: 'scroll_screen',
    description: 'Scroll the screen and call the tool to take screenshot',
    parameters: z.object({}),
    async execute(){
       page.waitForTimeout(2000)
       const viewport = page.viewportSize();
       let scrolled = 0;
        while (scrolled < viewport) {
            await page.mouse.wheel(0, step);  // scroll by step size
            scrolled += step;
            await page.waitForTimeout(100); // wait for some time between steps
        }
    }
})

const clickOnFields = tool({
  name: 'click_on_fields',
  description: 'Clicks on the screen with specified input fields from the screenshot image, the field which is the most accurate name and context in the query.',
  parameters: z.object({
    field: z.string().describe("Input type Field name present in the screenshot that matches the user query."),
    x: z.number().describe('x axis on the screen where we need to click for the input Field.'),
    y: z.number().describe('Y axis on the screen where we need to click for the input Field.'),
    value: z.string().describe("value given by user in query."),
  }),
  async execute({ field, x, y,value }) {

    console.log("Inside x, y",x, y, field)
    page.waitForTimeout(2000)
    const inputField = page.getByLabel(field)
    
    inputField.hover()
      page.waitForTimeout(200)
      
      page.mouse.click((await inputField.boundingBox()).x + 5,(await inputField.boundingBox()).y + 5);
      page.keyboard.type(value, { delay: 100 });
      console.log("fill...")
  },
});

const clickOnButton = tool({
    name: 'click_on_button',
    description: 'Clicks on the screen with specified button or link name from the screenshot image, the field which is the most accurate name and context in the query.',
    parameters: z.object({
        field: z.string().describe("Button or link Field name present in the screenshot that matches the user query."),
        x: z.number().describe('x axis on the screen where we need to click for the Button Field.'),
        y: z.number().describe('Y axis on the screen where we need to click for the Button Field.')
    }),
    async execute({field,x,y}){
        console.log("Inside Button",x,y,field)
        page.waitForTimeout(2000)
        const button = page.locator(`button:has-text("${field}")`);
        const link = page.locator(`a:has-text("${field}")`);
        if(await button.count()>0){
            button.hover();
            page.waitForTimeout(1000);  // waits 1 second (adjust as needed)
            button.click();
        }else if (await link.count() > 0){
            console.log("Inside Link",x,y,field)
            link.first().hover();
            link.first().click();
        }else{
            console.log("not found")
        }
        logWithIcon("success", "Completed...");
    }

})

const websiteAutomationAgent = new Agent({
    name : "Website Automation Agent",
    model : "gpt-4o-mini",
    instructions : `You are a website automation Agent. As per query you first check what is the website url and what are the input fileds need to be filled. You use tools for to do your task. Once done you can reply with completed message.

    Rules : 
    - Always first check users query and validate if any website url is present and what need to be filled out in the site. Extract these information availble.
    - Use tools for this.
    - Always wait for website to properly load.
    - After website load call the 'take_screenshot' tool in the begining. It will take screenshot of the screen.
    - After taking screenshot, plan the next action what needs to be done.
    - If form need to be filled up, findout field location and filled the user's input in the screen. Once filled go to next field. 
    - perfrom one task at a time. Fill one field at a time and take screenshot and then go for next field.
    - Always think before performing any task.
    
    `,
    tools: [openBrowser, takeScreenShot, clickOnFields, scrollScreen, clickOnButton]
})

const gatewayAgent = Agent.create({
  name: 'Triage Agent',
  instructions: `
  You determine which agent to use. If you feel not related to any automation task then can answer casually. 
   Otherwise please use website related automationation queries handoff to websiteAutomationAgent.
  `,
  handoffs: [websiteAutomationAgent],
});


async function chatWithAgent(query){
    try {
        const runner = new Runner()
        const response = await runner.run(websiteAutomationAgent, query, {
          maxTurns: 60,
        });
        logWithIcon("agent", response.finalOutput)
        // console.log(res)
        console.log(chalk.gray("-----------------------------------------"));
    } catch (error) {
        logWithIcon("error", err.message);
    }
}

// chatWithAgent("Hey what you are doing...")

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "👤 ", // prompt symbol
});

console.log(chalk.green("Welcome to CLI-Agent! Type 'exit' to quit."));
rl.prompt();

rl.on("line",(input) => {
  if (input.trim().toLowerCase() === "exit") {
    logWithIcon("info", "Goodbye!");
    rl.close();
    return;
  }

  // predefined actions
  chatWithAgent(input)

  rl.prompt(); // show prompt again
});



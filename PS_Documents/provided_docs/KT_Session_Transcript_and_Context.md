# KT Session Transcript & Implementation Context
## BPUT Hackathon 2026 — Problem Statement 8
**Problem Statement:** Development of an Online Portal for BRSR Reporting of Corporate ESG Report

**Source:** Industry–Student KT Session Transcript

**Source file:** Pasted text.txt

**Transcript length:** 1,333 timestamped lines

**Primary industry context:** Mega Engineering and Infrastructure Limited

**Primary implementation focus:** BRSR Section C — Scope 1, Scope 2 and Scope 3 emissions

## How to Use This Document
- Part I is a source-derived structured KT context layer.
- Part II contains the complete timestamped transcript as supplied.
- Do not treat these notes as a replacement for the SEBI guideline/specification or future industry-provided database/report files.
- Exact fields, report layouts and emission-factor values should be taken from the corresponding source artifacts when available.

## PART I — STRUCTURED KT CONTEXT

### 1. Session Identity and Problem Statement
- Industry–student KT / interaction session for BPUT Hackathon 2026.
- Problem Statement 8: Development of an online portal for BRSR reporting of corporate ESG report.
- Industry participants represented Mega Engineering and Infrastructure Limited; the session was moderated/hosted by the technology-partner side.
- The session combines background on ESG/BRSR with practical implementation guidance for the hackathon.

### 2. ESG and BRSR Background Covered in the Session
- Sustainability was explained as meeting present needs without compromising future generations.
- ESG was presented through Environmental, Social and Governance dimensions and as a formal reporting framework for corporates/institutions.
- The speaker connected ESG with the UN Sustainable Development Goals (SDGs), including the five broad pillars: People, Planet, Prosperity, Peace and Partnership.
- The session described the 17 SDGs and their targets as the broader sustainability context; this section is background rather than the hackathon's implementation specification.
- BRSR was described as the Indian corporate sustainability reporting format prescribed by SEBI, covering economic, environmental and social impacts.

### 3. Explicit Hackathon Scope
- The strongest implementation focus is Section C of BRSR.
- The engineering-focused hackathon scope is Scope 1, Scope 2 and Scope 3 greenhouse-gas emission data.
- HR, purchase and other BRSR information can exist in the broader standard, but the speaker explicitly asked teams to keep the hackathon scope focused on emissions data.
- Additional BRSR sections/features may be implemented for extra value/points if the core Scope 1–3 requirements and requested reports are already completed.

### 4. Scope 1, Scope 2 and Scope 3 Covered
- Scope 1: direct emissions from sources owned or controlled by the organization.
- Scope 1 examples/subcategories mentioned: stationary combustion (boilers, furnaces/heaters, diesel generators), mobile combustion (company cars, delivery trucks, fleets and other owned vehicles), process emissions, and fugitive emissions such as refrigerant leaks and SF6 leaks.
- Scope 2: indirect emissions associated with purchased electricity and utilities such as purchased power or steam. The source of purchased power matters for reporting/carbon-equivalent calculations; examples included photovoltaic/green power versus coal-based power.
- Scope 3: other indirect value-chain emissions, including upstream suppliers and downstream activities.
- Scope 3 examples mentioned: raw materials and supplier logistics, employee commuting, downstream logistics/distribution, waste disposal, business travel, flights and trains.
- The session explicitly requires the hackathon software to handle all three scopes.

### 5. Documentary Evidence and Auditability — Core Requirement
- Every emissions-data entry must be accompanied by official documentary evidence.
- Examples given: diesel purchase bill for reported diesel quantity; coal purchase bill for reported coal quantity; power purchase/source records; refrigerant or chemical records; logistics/travel documents; flight, train and bus tickets.
- The system should establish source-document traceability, audit trails and primary evidence for Scope 1–3 data.
- The speaker described external/independent assurance and emphasized that reported values must be matchable to underlying evidence.
- Unverified internal calculations without supporting invoices/documents were described as unacceptable/rejected by auditors.
- Evidence therefore is not an optional attachment feature; it is part of the core audit-ready data workflow.

### 6. Attachment / File-Management Expectations
- The system needs robust file management for evidence attachments across users, data entries and scopes.
- Different users may upload different files with the same filename; the system must prevent collisions and preserve identity/ownership.
- The system must track who uploaded which file and associate the file with the correct emission record/scope/project/user.
- The industry side indicated that suggested attachment/database designs generated using AI would be shared for teams to examine and evaluate.

### 7. Organization Hierarchy and Data Entry Model
- The organization hierarchy described is: Group → Company → Business Unit → Project.
- There are approximately 300 projects in the described operating model.
- Data entry occurs at the project level.
- Project-level users/employees enter operational data such as fuel, gas, power/electricity and travel, with documentary evidence.
- The system then aggregates project data upward so reporting can be produced at company/group level.
- The base company tables/structure (company, employee, roles, addresses, country/state codes, departments and related structures) were to be supplied by the industry side.
- Teams are primarily responsible for designing the Scope 1/2/3 emissions data structures.

### 8. Authentication and Authorization
- Authentication, authorization and password management are not supplied as part of the base employee-table structure.
- Teams are expected to implement their own authentication/authorization layer.

### 9. Emission-Factor / Carbon-Equivalent Data
- Teams need to research and implement carbon-equivalent/emission-factor tables for fuels/materials and relevant activities.
- Examples discussed included LPG, HSD/high-speed diesel, petrol, coal grades, CNG and PNG.
- The speaker specifically instructed teams to use the latest Indian-government-approved values appropriate to the Indian context rather than importing US/UK/European factors.
- Emission factors can change over time, so the data model should support updates/versioning rather than hard-coding a single permanent value.
- The session gave examples such as determining the carbon equivalent associated with a quantity of high-speed diesel or LPG.

### 10. Data Model Design Expectations
- The industry side planned to share base company database tables.
- They also planned to share AI-generated suggestions for attachment tables and Scope 1/2/3 database design.
- Those AI-generated designs are inputs/reference material, not an instruction to copy them blindly; teams are expected to understand them and make design decisions.
- The speaker warned against oversimplifying fuels/materials because categories can have different grades/types and therefore may need separate treatment.
- The data model should support the different categories and the evidence/traceability relationships required for audit-ready reporting.

### 11. Data Volume, Frequency and Financial-Year Handling
- The operating model described approximately 300 projects with roughly 5–10 users per project.
- Fuel-related entries may occur almost daily; water and electricity data may be monthly.
- The data is maintained continuously across financial years rather than closing the system after one year.
- The system must still be able to extract/report data for a selected financial year.
- For a hackathon demo, a small/local database is acceptable; a hosted demo does not need a production-scale database, provided the demonstration works.

### 12. AI Position in the Solution
- The speaker explicitly placed AI after the foundational data-collection layer.
- The first priority is reliable data capture, aggregation, calculation and reporting across the projects.
- AI was described as a later/top-layer capability that could answer analytical questions such as which projects consume more water or show other patterns once sufficient data has been collected.
- Teams should not sacrifice the core data-entry, evidence, calculation, validation and reporting workflow merely to add AI.

### 13. Reporting Requirements
- The system must generate the relevant SEBI-format emissions report for Section C / Scope 1–3 content.
- The speaker said teams should take the numbers accumulated by the system and place them into the format required by the SEBI guidelines.
- In addition to the SEBI-format report, the industry side planned to provide a larger list of reports that teams should implement.
- The requested reports are a key evaluation item alongside the data-entry workflow.

### 14. Travel / Scope 3 Clarification from Q&A
- Business travel by commercial flight/train was discussed as Scope 3 because the organization does not own/control the aircraft/train.
- If the organization owns/controls the emitting equipment, the example would fall under Scope 1.
- The speaker suggested that teams research activity-based carbon estimates for travel, including estimating a passenger's share of emissions on a train or flight.
- The transcript notes that some transport emission numbers may be estimates rather than exact measurements and require appropriate research.

### 15. UI/UX, Validation and Evaluation Expectations
- The industry representative emphasized ease of data entry, interface quality, report quality and validation rules.
- The database is foundational, but the interface and reports are important parts of the final product.
- Validation should help prevent bad/unsupported data from entering the reporting pipeline.
- The final solution should be audit-ready rather than merely a form that stores numbers.

### 16. Evaluation Data and Staging
- For mid evaluation/hackathon demonstration, teams can use their own simulated/sample data.
- The industry side indicated that real company data may be entered/tested during final evaluation.
- Mid evaluation is primarily for feedback and direction correction.
- Final evaluation is where rankings/prizes are decided.

### 17. Real-World Adoption Context Mentioned by Industry
- The industry representative stated that Mega Engineering and Infrastructure Limited is seriously pursuing BRSR reporting.
- The company had signed a contract with PwC consultants for FY 2026–27 reporting and wanted a report supported by evidence documents.
- The speaker indicated that a strong student solution could potentially be considered for further use after the hackathon, while also acknowledging the limited hackathon timeline.

### 18. Source-of-Truth Warning from the Session
- The presentation used during the KT was described as background/training material.
- The SEBI guideline PDF was explicitly identified as the actual specification containing the applicable rules and format.
- The speaker indicated that the presentation should be read for understanding, while implementation/reporting should follow the actual SEBI specification.

### 19. Materials / Inputs Promised or Referenced by Industry
- Base company database tables/structure.
- Company/employee/role/address/country/state/department-related structures.
- Suggested attachment database design.
- AI-generated suggestions for Scope 1/2/3 database design.
- Training/presentation PDF.
- SEBI guideline/specification PDF.
- A list/scope document and the requested report list.
- An email contact/channel for follow-up questions.

### 20. Practical Implementation Interpretation for the Hackathon
- Core flow implied by the session: Project user → enter Scope 1/2/3 activity → attach documentary evidence → validate/store → apply appropriate emission factor → calculate carbon-equivalent/emissions value → aggregate upward → generate required reports/SEBI Section C output.
- This workflow is an organizational interpretation of the session content; it is not a quoted specification.
- Any missing exact field names, exact SEBI table layouts, or exact emission-factor values must be taken from the corresponding source documents rather than invented from this transcript.

### Core Requirement Snapshot
- **Core scope:** Section C; Scope 1 + Scope 2 + Scope 3 GHG emissions
- **Data origin:** Project-level operational data
- **Hierarchy:** Group → Company → Business Unit → Project
- **Approx. scale:** 300 projects; ~5–10 users/project
- **Evidence:** Documentary evidence attached to emissions entries
- **Traceability:** User/file/data-entry association and audit trail
- **Factors:** Latest Indian-government-approved emission/carbon-equivalent values; support updates
- **Reports:** SEBI-format Section C emissions report + industry-requested reports
- **Validation:** Required; part of evaluation
- **UI/UX:** Ease of data entry and quality of reporting are important
- **AI:** Secondary; analytics after reliable data capture
- **Demo data:** Sample/simulated data acceptable for hackathon; real data may be used in final evaluation
- **Authentication:** To be implemented by the team

## PART II — COMPLETE TIMESTAMPED SOURCE TRANSCRIPT

> Source-preservation note: This section contains the complete timestamped transcript supplied for this KT session. No lines are intentionally omitted.

**[00:00:04]** Hello everyone and a very warm welcome

**[00:00:06]** to another industry student interaction

**[00:00:08]** session as part of EPOD hackathon 2026.

**[00:00:12]** I'm Sudepta and I will be your host as

**[00:00:14]** well as the moderator for today's

**[00:00:16]** session. I'm representing the Vedang

**[00:00:19]** Institute of Technology the technology

**[00:00:20]** partner for BPD hackathan 2026 and I'm

**[00:00:24]** delighted to be here with all of you. So

**[00:00:27]** today we are going to discuss about the

**[00:00:29]** problem statement 8 that is the

**[00:00:31]** development of an online portal for BRSR

**[00:00:35]** reporting of corporate ESG report. So

**[00:00:38]** this is a particular interesting problem

**[00:00:40]** statement because it brings together

**[00:00:42]** technology sustainability corporate

**[00:00:45]** reporting data management and real world

**[00:00:48]** business requirements. And to make

**[00:00:50]** today's conversation even more valuable,

**[00:00:52]** we have representatives from the

**[00:00:55]** industry joining us. So today we are

**[00:00:58]** privileged to have with us K. Lakmi

**[00:01:01]** Santi, deputy manager, Mega Engineering

**[00:01:03]** and Infrastructure Engineering, uh, Anu

**[00:01:06]** Gi, the senior executive, Mega

**[00:01:08]** Engineering and Infrastructure Limited

**[00:01:11]** and of course the Ready Rabi P. Ready,

**[00:01:15]** director, Mega Engineering and

**[00:01:16]** Infrastructure Limited. A very warm

**[00:01:18]** welcome to all of you sir and thank you

**[00:01:21]** so much for taking the time to join us

**[00:01:24]** as the part of equity hackathon 2026 and

**[00:01:27]** your presence is particularly valuable

**[00:01:30]** for our students because you are

**[00:01:32]** bringing something that cannot always be

**[00:01:34]** learned from a textbook or a technical

**[00:01:36]** tutorial. So the real world industry uh

**[00:01:39]** perspective that's uh you going to share

**[00:01:41]** with okay so on behalf of the BP

**[00:01:43]** hackathon team and the vidang institute

**[00:01:45]** of technology thank you for being here

**[00:01:48]** with us thank you sir thank you ready

**[00:01:50]** sir thank you all of you please now you

**[00:01:52]** can start the session over to you sir

**[00:01:55]** >> yeah I first request shanti and ana to

**[00:01:58]** just kind of say hello to all the

**[00:02:00]** participant online

**[00:02:03]** >> hello everyone uh my name is Shanti

**[00:02:07]** I'm here uh to uh um working in Meha

**[00:02:12]** Engineering and Infrastructures Limited.

**[00:02:14]** We working in safety uh department under

**[00:02:17]** Ravis. So we'll be the spoke for this

**[00:02:20]** hackathon and thank you. That was a very

**[00:02:24]** great introduction from uh uh BPU

**[00:02:27]** hackathon 2026. I wish all the best for

**[00:02:30]** you all guys.

**[00:02:33]** I'm Anesa. I'm from uh safety

**[00:02:36]** department. Uh I'm working with Rami

**[00:02:39]** sir. So I'm very grateful uh uh that I'm

**[00:02:42]** the member for this hackathon. So all

**[00:02:46]** the best guys do prepare and do well.

**[00:02:48]** Yeah. Thank you.

**[00:02:51]** >> Okay. Thank you. Thank you so much. It

**[00:02:53]** was so nice of you. So sir, we will

**[00:02:55]** start now the session. All you students,

**[00:02:58]** >> yes, I will start with the presentation.

**[00:03:00]** I need to get access to this to the

**[00:03:02]** screen. I'm going to I I hope you have

**[00:03:04]** given me access. Select uh

**[00:03:10]** I need the whole screen entire screen.

**[00:03:12]** Okay.

**[00:03:14]** >> Okay. As sir sharing sharing his screen

**[00:03:17]** just uh let me clear one thing that

**[00:03:19]** students I can see many of you have your

**[00:03:22]** cameras off. If your network and

**[00:03:24]** surrounding allow please switch on your

**[00:03:26]** cameras especially while interacting

**[00:03:28]** with your guests. It will make the

**[00:03:30]** session much more engaging and obviously

**[00:03:32]** that help us have a more personal

**[00:03:34]** conversation. Don't worry, this is not a

**[00:03:36]** camera test. It's simply a session. It's

**[00:03:39]** simply a KT session. Okay. Be free as

**[00:03:42]** well. Okay. Thank you guys. Thank you.

**[00:03:45]** Up to you sir.

**[00:03:47]** >> Yeah. I hope you can see my screen.

**[00:03:51]** >> Clearly visible sir.

**[00:03:52]** >> Yes.

**[00:03:52]** >> Okay. So this is a quick overview of

**[00:03:55]** what is ESG and then I'll come to the

**[00:03:58]** practical aspects of how we will write

**[00:04:00]** the code. But first I need to really

**[00:04:03]** explain to you what is EG and what is

**[00:04:05]** the BRSR format that is the business

**[00:04:09]** responsibility and sustainability

**[00:04:10]** reporting. So this is uh what is

**[00:04:13]** sustainability first of all we'll talk

**[00:04:15]** about that. So that is meeting the needs

**[00:04:21]** of the present without compromising the

**[00:04:24]** ability of future generations to meet

**[00:04:26]** their own needs. I think you all know

**[00:04:27]** that we already having water scarcity

**[00:04:30]** and there are a lot of things you

**[00:04:32]** already aware of the melting of the ice

**[00:04:35]** caps and various uh various ecological

**[00:04:38]** issues which have been brought about by

**[00:04:41]** the rapid development of mankind and we

**[00:04:44]** are occupying everything on earth. So it

**[00:04:47]** brings about a question whether we can

**[00:04:49]** sustain life as we do today. That means

**[00:04:52]** whatever we are enjoying today the water

**[00:04:55]** drinking water and fresh air and

**[00:04:57]** whatever food and all that will our

**[00:05:00]** future generations also be able to enjoy

**[00:05:03]** the same thing that's the basic question

**[00:05:06]** which we're talking about.

**[00:05:16]** So here the core concepts are

**[00:05:19]** sustainable development balances

**[00:05:20]** ecological concerns with economic

**[00:05:22]** growth. So at the same time for ecology

**[00:05:25]** we cannot all become hermits. We cannot

**[00:05:27]** become sadhus and sit in the mountains

**[00:05:30]** and leave our households and making new

**[00:05:32]** buildings and all that. So how do we

**[00:05:34]** balance the present with the future? So

**[00:05:38]** in business it's about strategies and

**[00:05:39]** action. So we are talking about

**[00:05:41]** something called environmental, social

**[00:05:43]** and governance metrics and we want to

**[00:05:46]** actually measure it. What cannot be

**[00:05:48]** measured cannot be managed. So we

**[00:05:49]** actually want to do some measurement of

**[00:05:52]** how we are creating a sustainable world

**[00:05:56]** which can continue into the future and

**[00:05:59]** mankind can live happily for a long time

**[00:06:01]** to come. So there's again uh whole lot

**[00:06:04]** of things shift from short-term profit

**[00:06:06]** to long-term consumers, investors,

**[00:06:09]** governments, employees, everybody. We

**[00:06:11]** really have to think everything

**[00:06:13]** operations, waste, people and a whole

**[00:06:16]** lot of things. So there are whole lot of

**[00:06:18]** agreements which were formed for example

**[00:06:21]** the Paris agreement and the sustainable

**[00:06:23]** development goals. We'll talk about

**[00:06:24]** that. There are whole lot of uh

**[00:06:26]** different things which come into this

**[00:06:28]** because we are a bit short of time. I

**[00:06:30]** will uh not go over each slide but I

**[00:06:33]** will actually send the PDF file to all

**[00:06:36]** the teams at the end of this talk along

**[00:06:38]** with our other Excel files and

**[00:06:40]** specifications. So let me uh quickly

**[00:06:44]** come to

**[00:06:46]** what are called circular design that

**[00:06:49]** means from manufacturing to reuse and

**[00:06:52]** recycling so that the same material

**[00:06:55]** keeps getting used again and again and

**[00:06:57]** again that's the ultimate goal without

**[00:07:00]** any with minimal waste and minimal raw

**[00:07:02]** material that's ultimate goal and we'll

**[00:07:05]** use all kinds of technology for that. So

**[00:07:08]** what we are talking at the very top

**[00:07:09]** level are sustainable development goals

**[00:07:13]** developed by the UN by the UNO. So all

**[00:07:17]** this is a kind of a bit of uh background

**[00:07:20]** on that you can read the slides. The

**[00:07:22]** main pillars of the SDGs are the five Ps

**[00:07:26]** people planet prosperity peace and

**[00:07:30]** partnership. So these are what they talk

**[00:07:33]** about. So the five pillars of the SDGs

**[00:07:36]** are people, looking after the people,

**[00:07:38]** the planet, prosperity, peace and

**[00:07:40]** partnership. So now how does it do that?

**[00:07:44]** So for that they have created 17

**[00:07:47]** interconnected global objectives

**[00:07:49]** designed to be shared blueprint. It's a

**[00:07:51]** plan for peace, prosperity, people and

**[00:07:54]** the planet. So there are 17 global goals

**[00:07:57]** and 169

**[00:07:59]** specific targets. And this is for 2030.

**[00:08:02]** That means we have only about four more

**[00:08:05]** years for this plan to end and then we

**[00:08:07]** can review what's going on and then

**[00:08:09]** maybe the UN will come out with new

**[00:08:12]** SDGs.

**[00:08:13]** The first one is very simple no poverty.

**[00:08:17]** So this is the first SDG number one and

**[00:08:21]** poverty in all its forms and India even

**[00:08:24]** though we claim we are a superpower

**[00:08:26]** economic superpower there are large and

**[00:08:29]** deep pockets of poverty all across

**[00:08:31]** India. We do acknowledge this and we

**[00:08:34]** have to work towards that. So basically

**[00:08:37]** you know like uh what is it roti

**[00:08:39]** kaparamakan kind of things even those

**[00:08:41]** are not available to many people in

**[00:08:43]** India and over the world we're talking

**[00:08:45]** about that number two food security no

**[00:08:48]** hunger even now a lot of human beings on

**[00:08:52]** the planet earth go hungry even though

**[00:08:55]** on the other side a whole lot of food

**[00:08:57]** that is grown goes waste uh on one side

**[00:09:01]** you have got people who are going hungry

**[00:09:03]** other side we got mismanagement of food

**[00:09:06]** food going waste and a whole lot of

**[00:09:07]** other issues. So this is the other SDG

**[00:09:11]** and hunger improve and then again uh I

**[00:09:14]** think there is a question of even when

**[00:09:17]** there's no hunger there is malnutrition

**[00:09:19]** for example a person might be alive and

**[00:09:21]** he's not dead but he doesn't have proper

**[00:09:24]** nutrition children don't grow up healthy

**[00:09:26]** and so that is another goal

**[00:09:29]** good health and wellbeing of course this

**[00:09:31]** is another major SDG

**[00:09:34]** generally you know how do you handle the

**[00:09:36]** finances of medical care and how do you

**[00:09:40]** handle epidemics and pandemics. I think

**[00:09:43]** uh you all know about the the COVID

**[00:09:45]** pandemic and of late I think recently

**[00:09:48]** there was the Ebola break outbreak in

**[00:09:51]** Africa and how does the whole world get

**[00:09:54]** together to handle all those kind of

**[00:09:56]** things. Then there's the pollution

**[00:09:58]** injuries and accidents and all that are

**[00:10:00]** part of this quality education.

**[00:10:04]** So this is again another uh big uh SDG

**[00:10:08]** of the UN basically talking about safe

**[00:10:11]** schools, good teachers and all kinds of

**[00:10:13]** improvements in schools. Gender rights,

**[00:10:16]** we still have a lot of issues with

**[00:10:18]** gender equality in leadership roles and

**[00:10:22]** child marriages and forced marriages and

**[00:10:24]** all this kind of stuff. How do we get

**[00:10:26]** total gender equality?

**[00:10:29]** So again uh there was I think you must

**[00:10:31]** have heard of this Betty Baja Betty PA

**[00:10:34]** campaigns. The fact that even we need a

**[00:10:37]** campaign like that shows that we still

**[00:10:38]** have a lot of gender equality parents

**[00:10:41]** still don't want girl childs and all

**[00:10:43]** these issues

**[00:10:44]** water clean water and sanitation

**[00:10:47]** drinking water for our usage and good

**[00:10:52]** sanitation that is you know how to

**[00:10:54]** handle the waste water and seage water

**[00:10:56]** and recycling and all that. Water is a

**[00:10:59]** big thing and even now a whole lot of

**[00:11:01]** people even in India and abroad don't

**[00:11:03]** have access to clean water for drinking

**[00:11:05]** and usage. Clean energy I think you know

**[00:11:09]** that the whole world is going toward

**[00:11:10]** green energy and trying to find out

**[00:11:13]** different things hydrogen energy this

**[00:11:15]** and that. So how do we get clean energy?

**[00:11:19]** I think even India has managed a huge

**[00:11:21]** surge of solar energy in the last one

**[00:11:24]** decade.

**[00:11:26]** Okay. Then

**[00:11:30]** decent work and growth. Of course, you

**[00:11:33]** want good work, good employment and all

**[00:11:35]** that. Then another SVG. Decent work,

**[00:11:38]** economic growth, industry and

**[00:11:40]** technology. Again, industry, innovation

**[00:11:43]** and infrastructure should be available

**[00:11:45]** to everybody in the world which is not

**[00:11:47]** happening now.

**[00:11:50]** For example, we talk about AI

**[00:11:52]** technology. It's only being used by few

**[00:11:54]** and controlled by a few. That kind of

**[00:11:56]** thing is not good for world improvement.

**[00:12:00]** Economic inclusion reduce inequalities.

**[00:12:03]** I think you keep reading that the top 1%

**[00:12:06]** of the world keep getting richer and

**[00:12:08]** richer where the bottom 10% keep getting

**[00:12:10]** poorer and poorer. So that's not good.

**[00:12:13]** We want uh everybody to be having some

**[00:12:18]** measure of economic prosperity.

**[00:12:21]** Urban resilient sustainable cities and

**[00:12:24]** communities. There is a huge pressure

**[00:12:26]** everybody is knowing from the villages

**[00:12:28]** to the cities and uh how do you make the

**[00:12:31]** cities sustainable and uh having smart

**[00:12:34]** cities green cities and all that very

**[00:12:36]** very difficult job because there's a

**[00:12:38]** huge concentration of human beings in

**[00:12:41]** these places and to maintain them

**[00:12:44]** maintain sustainability providing

**[00:12:46]** drinking water seage and all these it

**[00:12:48]** becomes a big problem

**[00:12:52]** responsible consumption and product and

**[00:12:54]** circular economy that is the goal is is

**[00:12:56]** zero waste but we don't get to zero

**[00:12:58]** waste so food waste reduction as I told

**[00:13:02]** you I think I was reading numbers that

**[00:13:04]** one/ird of all food waste produced is

**[00:13:06]** wasted 33% so 50% means 16% of the waste

**[00:13:12]** will go back to the human beings

**[00:13:16]** so then climate action all kinds of

**[00:13:19]** things for glo against global warming

**[00:13:21]** how to prevent ice caps melting global

**[00:13:23]** global warming, more trees and all that

**[00:13:26]** kind of stuff. Oceans and seas, there's

**[00:13:29]** a lot of pollution in the oceans.

**[00:13:30]** Plastic has been found at depths of 8 to

**[00:13:33]** 9 kilometers. Animals which are living 8

**[00:13:36]** kilometers underwater have got plastic

**[00:13:39]** inside them. Serious issue over fishing.

**[00:13:42]** How to manage the bounties of the oceans

**[00:13:46]** for us?

**[00:13:48]** Then biod diversity. How to maintain the

**[00:13:50]** forest and the animals and the flora and

**[00:13:52]** the fauna? Whole lot of species are

**[00:13:55]** extinct getting extinct. This is another

**[00:13:57]** big challenge for us.

**[00:14:00]** Peace and governance, peace, justice and

**[00:14:02]** strong institutions reduce corruption,

**[00:14:04]** rule of law and equal access. We still

**[00:14:06]** have a lot of issues in India and the

**[00:14:09]** world

**[00:14:11]** and global cooperation. I think you must

**[00:14:13]** be knowing about a lot of wars going on

**[00:14:15]** in the world. That's really bad for

**[00:14:17]** everyone in the world. whether we are a

**[00:14:19]** part of the war or not. So these are the

**[00:14:22]** 17 SDGs of the UN. Now

**[00:14:28]** who will work towards these things?

**[00:14:34]** Every human being on planet earth has to

**[00:14:37]** align his or her actions towards these

**[00:14:40]** goals.

**[00:14:42]** Only then it'll happen otherwise it will

**[00:14:44]** not happen.

**[00:14:46]** So these must be aligned across

**[00:14:48]** governments, corporations, institutions

**[00:14:50]** and individuals.

**[00:14:52]** So

**[00:14:54]** at the government level, you have to put

**[00:14:56]** these things into the national budgets

**[00:14:58]** and regulatory. Now at the corporate

**[00:15:02]** level, how do you do this? So ESG

**[00:15:05]** framework is a framework for corporates

**[00:15:09]** to show how aligned they are with the UN

**[00:15:12]** SDGs. So for any company or organization

**[00:15:16]** to show that it is working towards the

**[00:15:18]** fulfillment of the 17 UN SDGs

**[00:15:23]** we have this ESG framework. So ESG

**[00:15:26]** framework is a formal reporting

**[00:15:29]** structure for corporates and

**[00:15:31]** institutions to show that they are

**[00:15:33]** working

**[00:15:35]** in line with the UN SDGC.

**[00:15:39]** So here we have got uh you know all

**[00:15:43]** these SDGs and all we'll come back to

**[00:15:45]** it. So no these are the goals. Okay,

**[00:15:48]** that is just an example. Each of these

**[00:15:50]** SDG has targets.

**[00:15:53]** Okay, there are different targets. So

**[00:15:55]** you can go through a net and read all

**[00:15:57]** the targets for more information. Now

**[00:15:59]** I'll just come to what we are going to

**[00:16:01]** do for the project. We are creating a

**[00:16:05]** the software for Indian corporates and

**[00:16:09]** institutions

**[00:16:11]** to do their annual sustainability report

**[00:16:14]** in the format prescribed by SEBI the

**[00:16:17]** Securities and Exchange Bureau of India

**[00:16:20]** which creates the standards for India.

**[00:16:23]** So sustainability report is an overview

**[00:16:25]** of a company's economic, environmental

**[00:16:28]** and social impacts caused by its

**[00:16:29]** everyday activities.

**[00:16:32]** So this is what we are talking about E

**[00:16:34]** SG this is the format and the format for

**[00:16:37]** India has been given by sei.

**[00:16:41]** So the three parts to it environmental

**[00:16:43]** social governance. So environmental

**[00:16:45]** responsibility social responsibility

**[00:16:48]** governance governance is how do you

**[00:16:51]** manage your employees? How how is the

**[00:16:53]** company managed? How do you manage the

**[00:16:55]** finances? How do you manage HR? How do

**[00:16:57]** you manage your purchase? And how do you

**[00:17:00]** handle climate related risk? Better

**[00:17:02]** corporates should if every corporate and

**[00:17:05]** every institution aligns itself to the

**[00:17:07]** UN SDG then and only then can we hope to

**[00:17:10]** achieve the targets set by UN.

**[00:17:15]** So what do we do here? ESG reporting

**[00:17:17]** assess measure analyze and present

**[00:17:19]** performance. Set challenging targets and

**[00:17:21]** goal demonstrate commitment to

**[00:17:23]** sustainability transparent. Now the

**[00:17:25]** corporates are

**[00:17:27]** required to actually put these in

**[00:17:31]** reports in the public domain. Anybody

**[00:17:33]** can open the file and read the file and

**[00:17:36]** see how they are doing what they have

**[00:17:38]** reported.

**[00:17:40]** So the companies are required to be more

**[00:17:42]** transparent and so that all the that is

**[00:17:44]** what we are talking about DG. Why is it

**[00:17:46]** good? It gives customer because it's

**[00:17:48]** good for the customer. They know that

**[00:17:49]** this company has got good environmental

**[00:17:52]** focus, competitive advantage. You can,

**[00:17:55]** it increases your brand name and

**[00:17:58]** accountability. You give your numbers.

**[00:18:01]** So the investors, banks and who want to

**[00:18:04]** encourage your growth, economic growth

**[00:18:06]** know that you're a good company

**[00:18:10]** and it also a good thing for your

**[00:18:13]** employees. They feel good. They're

**[00:18:14]** working for a good company. Avoid

**[00:18:16]** greenwashing. Greenwashing is giving

**[00:18:18]** fake uh reports that you're ecologically

**[00:18:21]** good when you are not doing anything and

**[00:18:23]** it also shows yearby-year progress on

**[00:18:26]** sustainability parameters.

**[00:18:29]** So these were the the guidelines issued

**[00:18:31]** by uh the u ministry of corporate

**[00:18:35]** affairs in the beginning and these are

**[00:18:39]** all the names and now these are the

**[00:18:41]** principles.

**[00:18:45]** Hello

**[00:18:48]** Yes, you can hear me.

**[00:18:50]** >> Yes, sir, we can hear you.

**[00:18:52]** >> Yeah, because somebody else's voice went

**[00:18:54]** on. Okay, so these are the uh

**[00:18:58]** indicators. And uh now I'll just explain

**[00:19:00]** what is materiality. Materiality means

**[00:19:03]** like uh refers to the ESG topic that is

**[00:19:06]** significant enough to influence

**[00:19:07]** decisions, assessments or stakeholder

**[00:19:10]** understanding means what are the

**[00:19:12]** important points those are all

**[00:19:14]** considered as materiality. We give

**[00:19:17]** actual data of these things instead of

**[00:19:20]** just giving plain statements.

**[00:19:23]** So ESG issues are broad but reporting

**[00:19:25]** becomes useful only when the most

**[00:19:27]** relevant topics are prioritized. So we

**[00:19:30]** talk about real pollution number from

**[00:19:32]** fuel usage, how much coal we have burnt,

**[00:19:35]** how much diesel we have burnt, how many

**[00:19:37]** flights have we taken which create

**[00:19:39]** pollution and all that. So we focus on

**[00:19:41]** real numbers.

**[00:19:46]** So this again uh we only talk about few

**[00:19:50]** important ones and the standards of each

**[00:19:52]** country tell us which ones to focus on.

**[00:19:54]** So for example the present report

**[00:19:57]** structure is the BRSR uh report given by

**[00:20:00]** SEBI. It may change over few years but

**[00:20:03]** right now it gives a standard for all

**[00:20:05]** companies to show that they're working

**[00:20:07]** on this uh stuff.

**[00:20:10]** So now uh eh materiality I will just

**[00:20:14]** remove just you know I'm just you know

**[00:20:17]** skipping over this

**[00:20:21]** how it is done and uh

**[00:20:27]** okay here it is I'm just I had to skip a

**[00:20:30]** few things to work because we're short

**[00:20:31]** of time. So BRS comprehensive it is

**[00:20:34]** mandatory for the top thousand listed

**[00:20:37]** companies. It is not mandatory for

**[00:20:39]** unlisted privately held companies but

**[00:20:42]** they can do voluntary voluntary

**[00:20:45]** reporting. For example, in our case Mega

**[00:20:47]** Engineering Infrastructure Limited, we

**[00:20:49]** are a privately held company. We are not

**[00:20:52]** in the mandatory list but just for

**[00:20:54]** better branding and to show that we are

**[00:20:57]** a good corporate citizen of India and

**[00:20:59]** the world. We would we are already in

**[00:21:02]** the process of doing BRS

**[00:21:05]** BRS reporting. So in our case it's

**[00:21:08]** voluntary but uh in the some of the

**[00:21:11]** thousand top listed companies it is

**[00:21:13]** mandatory.

**[00:21:15]** So what does it have? It has mainly

**[00:21:17]** three sections. One is general

**[00:21:20]** information section A. Section D is

**[00:21:22]** management and process disclosures.

**[00:21:26]** Section C is principle wise performance

**[00:21:29]** disclosure. I would really ask the

**[00:21:32]** project teams to focus on section C.

**[00:21:34]** Even if they do not implement section A

**[00:21:36]** and section B, I am not bothered. Those

**[00:21:39]** are simple forms.

**[00:21:41]** The engineering part and understanding

**[00:21:44]** comes in section C. So I'm really making

**[00:21:46]** an open statement that teams do not have

**[00:21:49]** to implement section A and B. We'll keep

**[00:21:52]** it as uh as voluntary optional. But I

**[00:21:57]** want every team to implement things in

**[00:21:59]** section C because that's where we

**[00:22:01]** capture the data. That's where we

**[00:22:03]** capture the greenhouse gases and all

**[00:22:06]** kinds of things. So once again I'm

**[00:22:08]** repeating for the uh hackathon

**[00:22:12]** of BP we'll focus mainly on section C.

**[00:22:15]** If you do section A and B good we'll

**[00:22:17]** give some extra credit but section C

**[00:22:20]** must be done. So we are going to f and

**[00:22:22]** I'll tell you what is section C. Section

**[00:22:24]** C again has two things. Essential

**[00:22:26]** indicators mandatory and leadership

**[00:22:28]** indicators voluntary which may or may

**[00:22:30]** not be given. So this is section A is

**[00:22:33]** about product services operational

**[00:22:35]** employees. Section B is about policies

**[00:22:37]** and whether you have got you know sexual

**[00:22:39]** harassment policies, child labor

**[00:22:41]** policies and all that kind of stuff.

**[00:22:44]** Section C is what I'm talking about. All

**[00:22:47]** the hackathon teams must implement.

**[00:22:49]** Essential indicators are energy

**[00:22:53]** emissions, water and waste.

**[00:22:57]** So these are the things directly related

**[00:23:00]** to the

**[00:23:02]** uh emission of carbon dioxide and uh

**[00:23:06]** other greenhouse gases and we talk about

**[00:23:10]** training and community initiatives in

**[00:23:13]** the BRSR scope 3 emissions. I'll just

**[00:23:16]** explain in a minute what is scope three.

**[00:23:19]** Essential indicators have what is called

**[00:23:21]** scope one and scope two. Scope three

**[00:23:23]** emissions are voluntary but I'll explain

**[00:23:25]** all three. And I want the hackathon

**[00:23:27]** teams to implement scope one, scope two

**[00:23:30]** and scope three emissions. Repeat the

**[00:23:33]** hackathon teams must implement

**[00:23:36]** the scope one, scope two and scope three

**[00:23:40]** emissions.

**[00:23:41]** So what are the scope one, scope 2,

**[00:23:43]** scope three emissions? So first of all

**[00:23:46]** we are talking about greenhouse gas

**[00:23:47]** emissions. What are the greenhouse gases

**[00:23:50]** like nitrous oxide and polychloro

**[00:23:53]** fluorides and carbon dioxide and methane

**[00:23:56]** sulfur hexaflloride and other things

**[00:23:59]** ozone and all that. Okay you can read up

**[00:24:01]** on that.

**[00:24:03]** So it says you must give scope one,

**[00:24:05]** scope two and scope three. Scope three

**[00:24:08]** is optional in BRSR but I'm making it

**[00:24:10]** compulsory for the hackathon. All

**[00:24:12]** hackathon teams must implement scope

**[00:24:15]** one, scope two and scope 3 GG emissions

**[00:24:18]** framework. That is my requirement.

**[00:24:22]** So I'll just go on to that. Now here

**[00:24:25]** understanding what is the difference

**[00:24:27]** between 1, two and three. One is direct

**[00:24:30]** emissions from company owned or

**[00:24:33]** controlled operational asset. Suppose I

**[00:24:35]** have a diesel generator and I'm putting

**[00:24:38]** diesel and it is it is throwing the

**[00:24:42]** exhaust. The exhaust is is releasing

**[00:24:45]** pollutants into the atmosphere. That is

**[00:24:47]** scope one.

**[00:24:49]** Scope two

**[00:24:52]** indirect energy. Indirect emission from

**[00:24:54]** generation of purchase electricity,

**[00:24:56]** steam or cooling. Suppose I buy some

**[00:24:59]** power through the power grid. It is

**[00:25:01]** clean energy. I'm not doing any

**[00:25:02]** pollution of any kind. But suppose I am

**[00:25:06]** buying that power that electricity from

**[00:25:08]** a coal based power plant that power

**[00:25:12]** plant is creating pollution. So since

**[00:25:14]** I'm buying that I have to I have to

**[00:25:17]** report that in scope two.

**[00:25:21]** Suppose I am buying some steam from from

**[00:25:24]** a neighboring plant. Somebody is

**[00:25:26]** supplying me hot steam at 80°

**[00:25:30]** or whatever 100° or whatever it is for

**[00:25:33]** my process from a neighboring plant.

**[00:25:35]** Steam by itself is non-polluting.

**[00:25:38]** But the company which is supplying me

**[00:25:41]** steam may have used coal or oil burning

**[00:25:45]** to create the steam. So this is scope to

**[00:25:48]** emissions.

**[00:25:50]** Then scope three is value chain. all

**[00:25:53]** other indirect emissions across upstream

**[00:25:56]** suppliers and downstream consumers.

**[00:25:59]** For example, I buy a 100 kg of

**[00:26:05]** bolts, stainless steel bolts.

**[00:26:08]** So stainless steel bolt by itself is not

**[00:26:10]** polluting but the manufacturing company

**[00:26:13]** which prepared which manufactured those

**[00:26:16]** stainless steel bolts may have used some

**[00:26:18]** power for heating coal uh or something

**[00:26:22]** else or diesel or something they might

**[00:26:24]** have created pollution.

**[00:26:27]** Similarly I catch a flight and go from

**[00:26:29]** one place to other.

**[00:26:32]** So I being on that flight, the

**[00:26:37]** aeroplane which carries me from place A

**[00:26:40]** to place B has some greenhouse gas

**[00:26:44]** emissions. It uh it burns fuel and

**[00:26:46]** create some carbon dioxide other

**[00:26:48]** pollutant. So that should be also put in

**[00:26:51]** my account. So that is scope three.

**[00:26:55]** Scope one is direct emissions from the

**[00:27:00]** sources on site. Scope two is indirect

**[00:27:02]** from energy and utilities. Scope three

**[00:27:05]** is emissions of the chain supply or

**[00:27:08]** service. We want all three of them uh to

**[00:27:12]** be handled in the hackathon software. So

**[00:27:17]** once again for and then there are again

**[00:27:19]** classified into subcategories. Scope one

**[00:27:22]** is classified into stationary

**[00:27:23]** combustion, boilers, furnitureures,

**[00:27:25]** heaters and diesel generators. mobile

**[00:27:28]** combustion by cars, delivery trucks,

**[00:27:30]** sales fleets, power own vehicles. So

**[00:27:33]** whether they are petrol or diesel or gas

**[00:27:36]** based vehicles, process and fugitive

**[00:27:38]** emissions, our processes which we do

**[00:27:41]** might leave some pollutant. For example,

**[00:27:44]** if you have a galvanizing unit, there

**[00:27:46]** are a lot of hydrochloric acid which is

**[00:27:49]** used to leech the steel pieces before

**[00:27:52]** they put into the zinc bar or uh the HBA

**[00:27:57]** acid that is your heating ventilation

**[00:27:58]** and air conditioning. If the air

**[00:28:00]** conditioning refrigent leaks that is

**[00:28:02]** pollution for the another example is we

**[00:28:06]** you must be wondering where is this

**[00:28:08]** sulfur hexafluoride coming from.

**[00:28:10]** Nowadays most of the subpower

**[00:28:12]** substations are indoor uh gas insulated

**[00:28:17]** substations. So the gas insulated

**[00:28:19]** substations carry all the switch gear

**[00:28:22]** inside vessels containing sulfur

**[00:28:26]** hexafloulloride which is used to prevent

**[00:28:28]** sparking.

**[00:28:29]** But if it leaks out of the system it is

**[00:28:31]** a highly dangerous pollutant. So we have

**[00:28:34]** to report that.

**[00:28:37]** Scope two is purchase electricity and

**[00:28:39]** utilities. For example, we buy power or

**[00:28:42]** we buy steam or something like that. How

**[00:28:44]** much we have bought and for what kind of

**[00:28:46]** source. For example, if you have bought

**[00:28:48]** power from a photoaltike

**[00:28:50]** power plant, we have to report it

**[00:28:52]** separately. That's green energy. If you

**[00:28:54]** have buy it from a coal based power

**[00:28:56]** plant, we should report it separately.

**[00:28:58]** If you bought it from a idle power plant

**[00:29:00]** which is quite good in terms of

**[00:29:02]** environment, we should report from where

**[00:29:05]** we are buying our power so that we can

**[00:29:07]** calculate the the carbon equivalent of

**[00:29:10]** what we have bought.

**[00:29:13]** Value chain. This is upstream you know

**[00:29:14]** what raw materials supplier logistics BJ

**[00:29:17]** employee commuting downstream logistics

**[00:29:20]** to distributor we send our goods

**[00:29:22]** somewhere somewhere and uh waste

**[00:29:25]** disposal and all this kind of stuff.

**[00:29:27]** Here are some examples of scope one,

**[00:29:30]** scope two, scope three. Okay. Now I come

**[00:29:33]** to the next important part for the

**[00:29:36]** hackathon.

**[00:29:39]** There is a very important key part of

**[00:29:41]** BRSR reporting that is documentary

**[00:29:43]** evidence. Every piece of data entered

**[00:29:47]** must be accompanied by an uh official

**[00:29:51]** document. For example, you you have

**[00:29:54]** reported that you bought 200 L of

**[00:29:57]** diesel. There should be a the bill for

**[00:30:00]** 200 L of diesel. You have bought 40 tons

**[00:30:03]** of coal for your coal power plant. I

**[00:30:06]** need the purchase bill for that 40 tons

**[00:30:08]** of coal. We need so establishing source

**[00:30:11]** document traceability reasonable assure

**[00:30:14]** audit trails and primary evidence

**[00:30:15]** standards for scope 1 to three. So

**[00:30:18]** documentary evidence is very very

**[00:30:20]** important. So every entry in the

**[00:30:24]** emissions data whether it's scope one or

**[00:30:26]** scope two or scope three must be

**[00:30:28]** accompanied by documents. Okay. So this

**[00:30:32]** uh has you you you must have a requires

**[00:30:36]** independent third party assurance. So in

**[00:30:39]** fact how important is it? There will be

**[00:30:42]** an external auditor who will check your

**[00:30:44]** data match it with the documents.

**[00:30:48]** So everything must be matched with

**[00:30:51]** underlying invoices. For rule one,

**[00:30:53]** unverified internal calculations without

**[00:30:56]** underlying invoices are rejected by the

**[00:30:58]** auditors.

**[00:31:00]** Why? Because it it stops fake claims.

**[00:31:04]** Verification protect corporate

**[00:31:05]** reputation ensures capital market and

**[00:31:08]** mandatory result. Now

**[00:31:12]** these evidence standards are very very

**[00:31:13]** high in BRSR. There must be everything

**[00:31:17]** must be accompanied by evidence in

**[00:31:19]** document. Okay. What are fuel leg? What

**[00:31:22]** what what can it mean here? Station fuel

**[00:31:25]** in the diesel wheels way bridge slave

**[00:31:27]** boiler log book. Uh how much uh

**[00:31:31]** refrigerant you have bought? How many

**[00:31:33]** chemical reactions happened? What gases

**[00:31:36]** were released in the lab? This is what

**[00:31:39]** kind of power you have bought from what

**[00:31:40]** kind of source.

**[00:31:42]** power PPAs,

**[00:31:45]** how many kilometers of how much uh you

**[00:31:48]** have uh you know sent or received goods,

**[00:31:53]** travel agency, flight tickets, train

**[00:31:55]** tickets, bus tickets, all this kind of

**[00:31:58]** stuff.

**[00:31:59]** So why that is what is the goal of our

**[00:32:02]** hackathon? We are trying to create an

**[00:32:04]** audit ready ESD data system and for

**[00:32:06]** hackathon we are focusing on scope one,

**[00:32:09]** scope two and scope three emission data.

**[00:32:12]** So this all needs documents.

**[00:32:15]** So here's the main thing. We need a lot

**[00:32:18]** of attachments.

**[00:32:20]** Evidence should be attached as files. We

**[00:32:23]** need a robust file management system for

**[00:32:25]** managing the attachments by different

**[00:32:28]** users for different data entries for

**[00:32:30]** different scopes. Scope one, scope two,

**[00:32:32]** scope three.

**[00:32:34]** This is the important part of the

**[00:32:36]** project. Now after this there are a

**[00:32:37]** whole lot of of of uh of other stuff

**[00:32:40]** which you can read on your own. I will

**[00:32:43]** not uh go through this. I'm stopping

**[00:32:48]** sharing and I'll come back here.

**[00:32:53]** Okay. So after that introduction I'll

**[00:32:55]** tell you what we are going to share. We

**[00:32:58]** are going to share the base database

**[00:33:01]** tables of our company means how do you

**[00:33:04]** write the how do you manage the

**[00:33:06]** employees the company data the roles and

**[00:33:11]** how do you write addresses country code

**[00:33:14]** state codes the basic database structure

**[00:33:17]** for that we will give you we'll send you

**[00:33:19]** the structure okay number one the base

**[00:33:22]** tables of the company departments and

**[00:33:25]** all that we'll send you the tables And

**[00:33:28]** if you have any doubts you can send us

**[00:33:30]** mail

**[00:33:31]** or we can explain it in another session

**[00:33:35]** to be held maybe uh after a few days.

**[00:33:38]** That thing one thing I'm going to send

**[00:33:39]** you. Second thing I'm going to send you

**[00:33:42]** is the suggestions for attachments.

**[00:33:48]** How do you manage attachments in

**[00:33:50]** software

**[00:33:52]** and along with the database design taken

**[00:33:54]** from chat GPT and Geminina AI?

**[00:33:58]** What are the issues in attaching

**[00:34:00]** documents? I have something called file

**[00:34:03]** one. I have attached it. My friend also

**[00:34:06]** names his file file one dock. They're

**[00:34:09]** two different files but two different

**[00:34:10]** users can load the their files under the

**[00:34:13]** same name. You have to manage that. Then

**[00:34:16]** you have to manage who loaded what file.

**[00:34:19]** Okay. So there's a bit of uh so I asked

**[00:34:24]** the simple query to chat GPD and Gemini

**[00:34:28]** and whatever output I got I will be

**[00:34:30]** sharing with you in terms of attachment

**[00:34:33]** database design. Okay that I'm going to

**[00:34:36]** give to you. So the first is the basic

**[00:34:40]** tables of users and companies and how

**[00:34:43]** are companies organized. Second is how

**[00:34:45]** do you attach? The third part I have

**[00:34:48]** done is I have asked again chat GPD and

**[00:34:51]** Gemini to give me the table design for

**[00:34:55]** entering scope one, scope 2 and scope 3

**[00:34:58]** data based on BRSR guidelines. Okay. So

**[00:35:04]** it gave me some suggestions for tables.

**[00:35:06]** I have not gone through it. Whatever

**[00:35:09]** outputs I got from Gemini and uh chat

**[00:35:12]** GPT I will share with you how you use

**[00:35:15]** them whether you understand not

**[00:35:17]** understand it's your job the outputs

**[00:35:20]** from the two AI engines I will give you

**[00:35:24]** so that you do not underdesign you might

**[00:35:27]** think something very simple that you

**[00:35:29]** will simply add one one table this much

**[00:35:32]** coal and uh and you know this much

**[00:35:36]** diesel but They understand coal has

**[00:35:39]** different grades. Coal anththerosite

**[00:35:42]** then coal is pit grade different grades.

**[00:35:46]** Then diesel you get diesel you got

**[00:35:48]** highspeed diesel. Then in in gas you got

**[00:35:51]** CNG, you got uh PNG and different kinds

**[00:35:55]** of gases. So you have to make table

**[00:35:58]** maintain them separately.

**[00:36:00]** Then

**[00:36:02]** there is again something you have to do.

**[00:36:04]** You have to find out the carbon

**[00:36:05]** equivalents.

**[00:36:07]** One liter of highspeed diesel being

**[00:36:10]** burnt emits how much carbon equivalent

**[00:36:12]** those tables are available. You have to

**[00:36:16]** take the tables approved by the Indian

**[00:36:19]** government for the Indian context. Don't

**[00:36:22]** take carbon tables from US or UK or or

**[00:36:26]** Europe. Find the tables for India

**[00:36:30]** whatever they have approved and they

**[00:36:31]** keep changing also. So find the latest

**[00:36:35]** carbon equivalent tables for example 1

**[00:36:39]** kg of anthraite core what is the coal

**[00:36:41]** equivalent those tables are available

**[00:36:44]** they're updated time time to time by the

**[00:36:48]** Indian government you have to take those

**[00:36:50]** and do that

**[00:36:53]** okay so once again let me out so that

**[00:36:57]** and that PDF of my presentation I'll

**[00:36:59]** share with you just for general reading

**[00:37:02]** Then there is a sebi guidelines the

**[00:37:04]** actual PDF which has already been shared

**[00:37:07]** in the first phase. If you didn't get it

**[00:37:09]** I will share it again. So just the

**[00:37:12]** training PDF which I just did and the

**[00:37:14]** sebi guidelines book I will just give it

**[00:37:16]** to you. There are whole lot of things

**[00:37:19]** but being

**[00:37:22]** all of you are going to are engineers.

**[00:37:24]** So I want to focus on the engineering

**[00:37:26]** part of the whole software that is

**[00:37:29]** section C scope one scope two and scope

**[00:37:34]** three emission data there's a whole lot

**[00:37:36]** of other things which come from HR uh

**[00:37:39]** what is the gender ratio and all that we

**[00:37:42]** will see afterwards but I really want to

**[00:37:44]** keep the scope simple and clear and good

**[00:37:48]** for engineering students. So we'll focus

**[00:37:51]** on the part of BRSR

**[00:37:54]** which focuses on the emissions data

**[00:37:58]** only scope one data scope two data scope

**[00:38:01]** three data so that will make it easier

**[00:38:03]** for you guys to focus read understand

**[00:38:07]** and implement. Now I'm open to questions

**[00:38:10]** from the

**[00:38:14]** and one more thing uh thanks to the

**[00:38:16]** Vedang Institute of Technology team for

**[00:38:18]** hosting this and hosting the first uh

**[00:38:22]** video podcast also. So thanks to the

**[00:38:24]** entire team of of Vedang Institute of

**[00:38:28]** Technology for the technical support and

**[00:38:30]** the continued uh support for BP

**[00:38:33]** hackathon.

**[00:38:34]** >> Thank you sir. Thank you so much. That's

**[00:38:36]** really so nice of you. Okay. Now the

**[00:38:39]** students if you have any doubts or any

**[00:38:41]** questions coming to your mind please

**[00:38:43]** feel free to ask to the sir. Okay please

**[00:38:46]** guys and make sure when you are asking

**[00:38:49]** the questions to sir please switch on

**[00:38:51]** your camera so that it will be so

**[00:38:53]** soother. Okay, please.

**[00:39:08]** Yes, I see about 40 odd participants.

**[00:39:25]** Yes.

**[00:39:27]** >> Uh sir, I would like to say that uh in

**[00:39:31]** some condition like uh we are uh

**[00:39:34]** arranging a international meeting or

**[00:39:38]** some kind of things where we going from

**[00:39:41]** one place to another place because we

**[00:39:43]** need to add the carbon emission rates of

**[00:39:46]** also also

**[00:39:49]** >> that is called scope three. When we do

**[00:39:51]** any travel on a train or a flight or

**[00:39:54]** anything we are that that aeroplane is

**[00:39:59]** not ours. If you own that aeroplane for

**[00:40:03]** example you are Amani son and you are

**[00:40:05]** traveling with your own aeroplane that

**[00:40:07]** will come under scope one because that

**[00:40:09]** is your own equipment which is emitting

**[00:40:12]** you know pollutants. But if you just

**[00:40:15]** catch an indigo flight and go from say

**[00:40:18]** from Hyderabad to Bonasar it will have

**[00:40:21]** an carbon equivalent because you are buy

**[00:40:23]** flying. So if you buy an international

**[00:40:26]** flight ticket nowadays on all the

**[00:40:28]** international flight tickets they

**[00:40:29]** mention I traveled from here to some

**[00:40:32]** Hong Kong it said 42 kg of carbon it's

**[00:40:35]** written on the flight ticket because

**[00:40:38]** that that becomes scope three. If you

**[00:40:40]** fly your own aeroplane it becomes scope

**[00:40:42]** one.

**[00:40:44]** >> Okay sir.

**[00:40:47]** >> Train ticket also same thing. If you

**[00:40:49]** travel from one place to other you you

**[00:40:51]** have to find you. So one of the jobs you

**[00:40:53]** have to do is do a lot of R&D and

**[00:40:56]** finding out this kind of numbers. For

**[00:40:58]** example, if it's an express train which

**[00:41:01]** is traveling 1,000 kilometers, what is

**[00:41:03]** the carbon load per human being? But but

**[00:41:07]** you are not the only passenger on the

**[00:41:08]** train, right?

**[00:41:09]** >> Yeah. So how many passengers are there

**[00:41:11]** divided some estimate number they'll not

**[00:41:13]** be exact numbers but there will be

**[00:41:15]** estimated number.

**[00:41:25]** >> Uh good afternoon sir.

**[00:41:27]** >> Uh sorry sorry guys for interrupting in

**[00:41:30]** between. Please uh could you please

**[00:41:32]** switch on your camera after that?

**[00:41:34]** >> Yeah we want to see you man. We want to

**[00:41:36]** see your beautiful face.

**[00:41:38]** >> Yes sir. Exactly. So please switch on

**[00:41:40]** your camera, tell us your name and your

**[00:41:42]** team name. Then simply ask the question.

**[00:41:45]** Definitely sir is here to answer you.

**[00:41:47]** Okay. Please.

**[00:41:50]** >> Hello.

**[00:41:51]** >> Hello sir. I want to know that what are

**[00:41:54]** the types of data we need to feed in the

**[00:41:56]** our website about our uh your company

**[00:42:01]** >> that those labels we will share with you

**[00:42:06]** at the end of this talk. The complete

**[00:42:09]** database structure of our company we

**[00:42:12]** will share with you at the end of this

**[00:42:14]** talk. So complete database, table name,

**[00:42:16]** field name, we'll give you everything.

**[00:42:18]** So that part we will give you from here.

**[00:42:20]** So that you don't have to worry. Your

**[00:42:22]** main focus is to design the tables for

**[00:42:26]** the scope one, scope 2, scope 3

**[00:42:30]** greenhouse gas emission because those

**[00:42:32]** tables you have to do design. I have

**[00:42:34]** given some inputs from AI from Gemini

**[00:42:37]** and uh Chad GP but that's just an output

**[00:42:39]** it just so you can use AI tools but you

**[00:42:42]** have to take a decision on that our

**[00:42:44]** company tables we'll share with you at

**[00:42:47]** the end of this talk

**[00:42:50]** >> okay sir thank you

**[00:42:52]** >> yeah welcome

**[00:42:54]** >> good evening sir I'm prat and

**[00:42:57]** >> one small thing uh the password

**[00:42:59]** management and all that we are not going

**[00:43:01]** to give you implement your own okay in

**[00:43:04]** The employee table for example the

**[00:43:07]** authorization and authentication we are

**[00:43:08]** not doing that you have to add on your

**[00:43:10]** own that's your baby we're just giving

**[00:43:12]** the structure over yeah please go ahead

**[00:43:16]** >> good evening sir

**[00:43:18]** >> I'm prush and we are team soul matrix so

**[00:43:21]** my question is like the software which

**[00:43:23]** you are going to build who are the

**[00:43:25]** primary users apart from group

**[00:43:27]** subsidiaries entities and business

**[00:43:29]** groups

**[00:43:30]** >> okay now here's what will happen you

**[00:43:33]** will see that In the hierarchy of the of

**[00:43:36]** our organization structure we have put

**[00:43:37]** group company business unit projects.

**[00:43:43]** So the people from the projects if they

**[00:43:45]** buy 100 ml of petrol they will enter it

**[00:43:48]** and and they'll scan the bill upload it

**[00:43:50]** they bought 100 liters of petrol. So

**[00:43:54]** there are about 300 projects they enter

**[00:43:56]** the data into that. Okay then you have

**[00:43:59]** to bring that up at the top level. We

**[00:44:01]** will add all those numbers for the

**[00:44:03]** company. You understand? So the data

**[00:44:05]** entry will happen at the project level

**[00:44:08]** but we will do the report at the group

**[00:44:11]** level. So the group contains companies,

**[00:44:13]** companies contain business units,

**[00:44:15]** business units contain uh the projects

**[00:44:18]** and this table structure we are going to

**[00:44:20]** share at the end of this talk. So the

**[00:44:23]** entries by the employees at the project

**[00:44:25]** level. So 300 projects every day

**[00:44:28]** whatever coal, diesel, gas, uh you know

**[00:44:32]** power they have bought, whatever travel

**[00:44:35]** they have done, they have to keep on

**[00:44:36]** entering. Then we have to add up all the

**[00:44:38]** numbers for the

**[00:44:44]** does that answer your question or you

**[00:44:46]** have any further questions on that?

**[00:44:48]** >> No sir, no sir. Thank you sir.

**[00:44:50]** >> Yeah. So that hierarchy we are giving

**[00:44:52]** and it'll happen at the bottom level

**[00:44:55]** and just to keep the scope small I'm I'm

**[00:44:59]** defining it your there will be lot of HR

**[00:45:02]** and purchase data in the BRSR we don't

**[00:45:05]** have you don't do that for BPU hackathon

**[00:45:08]** focus on data of the greenhouse gas

**[00:45:12]** emissions scope one scope two scope

**[00:45:14]** three emissions we'll only look at that

**[00:45:16]** that will keep your uh project focused

**[00:45:19]** and having engineering focus the HR

**[00:45:22]** data, purchase data and all. We will not

**[00:45:24]** do it. If you have the time you can do

**[00:45:26]** that, but I would focus on these three

**[00:45:29]** things.

**[00:45:32]** >> Good afternoon sir.

**[00:45:34]** >> Good afternoon ma'am.

**[00:45:35]** >> This is Moisha from teamrx.

**[00:45:39]** So my question is from apart from the

**[00:45:42]** existing datas if you're integrating any

**[00:45:45]** AI what are the expectations or outcomes

**[00:45:48]** that you are expecting if you're

**[00:45:50]** integrating AI.

**[00:45:53]** >> H okay let me say before AI we need

**[00:45:55]** data.

**[00:45:58]** So this is a data collection tool. I

**[00:46:00]** need to collect data from 300 projects

**[00:46:03]** of mine.

**[00:46:06]** So once we have the data then we can

**[00:46:09]** have I intelligence and if intelligent

**[00:46:12]** doesn't work we'll go to AI. So uh this

**[00:46:16]** is a data collection tool.

**[00:46:20]** Okay. So where we'll use AI I don't know

**[00:46:23]** because we have to it's basically very

**[00:46:26]** old fashioned data. If I buy 100 L of

**[00:46:29]** petrol I have to scan the bill upload

**[00:46:31]** it. I bought a gas cylinder for welding.

**[00:46:33]** I have to scan the bill and upload it

**[00:46:36]** and enter one gas cylinder of 15.2 kg

**[00:46:39]** was bought. Then I bought one tanker of

**[00:46:41]** diesel uh with 5,000 liters of highspeed

**[00:46:44]** diesel. I have to enter. It's a lot of

**[00:46:46]** data entry. And then your job is to find

**[00:46:49]** out what are the carbon equivalents for

**[00:46:52]** each LPG. 1 kg equal to how many kg of

**[00:46:56]** carbon dioxide. Find the tables,

**[00:46:59]** implement them, do all that.

**[00:47:01]** the AI will come somewhere on the top.

**[00:47:03]** For example, I'll ask which kind of

**[00:47:05]** projects are are spending more water,

**[00:47:08]** which kind of projects are end with a

**[00:47:10]** bit that's afterwards. First of all, our

**[00:47:13]** job is capture the data, aggregate it so

**[00:47:16]** that I can report to the to the to the

**[00:47:19]** government. So AI will come at a next

**[00:47:22]** level once we have gathered data from

**[00:47:24]** 300 different places for electricity,

**[00:47:27]** fuel and travel a lot of data.

**[00:47:34]** >> Thank you.

**[00:47:34]** >> This is a this is a dalbath project. No

**[00:47:38]** dalbath roy project. Very old-fashioned.

**[00:47:43]** But I need you to do the basic research.

**[00:47:46]** Get the tables of the equivalents. I'll

**[00:47:48]** see how flexibly you do the data entry

**[00:47:51]** table, how good your interface is, how

**[00:47:55]** you know easy to use, how well I can get

**[00:47:57]** reports and we'll give you the what

**[00:48:00]** reports we need that we'll send you.

**[00:48:02]** We'll see how many reports we can do out

**[00:48:04]** of it.

**[00:48:06]** >> Thank you very much sir for the

**[00:48:07]** briefing.

**[00:48:08]** >> Okay.

**[00:48:10]** Hello sir.

**[00:48:12]** >> Yeah

**[00:48:14]** sir. I want to know that uh does we need

**[00:48:17]** to only calculate the carbon emission uh

**[00:48:19]** scores or we need to generate the full

**[00:48:22]** report that we send the uh sebi to uh to

**[00:48:27]** your company.

**[00:48:28]** >> You have to create that sebi report of

**[00:48:31]** part C see inside that PDF what is the

**[00:48:35]** format given by sebi reporting for the

**[00:48:38]** emissions. So you that report also you

**[00:48:41]** have to create apart from a whole other

**[00:48:42]** report. will give you a big list of

**[00:48:44]** reports. So one report will be the SEBI

**[00:48:48]** report where you have to add up all the

**[00:48:49]** numbers put it in the format required by

**[00:48:52]** SEBI. So that PDF of the SEBI guidelines

**[00:48:55]** that will be one report definitely that

**[00:48:58]** is the full overall report

**[00:49:01]** >> and sir.

**[00:49:02]** >> Okay. So what we need we will give you

**[00:49:05]** yes you are asking something else. Sir

**[00:49:08]** as we know SEI do not get the report in

**[00:49:11]** the form of PDF or other Excel sheet

**[00:49:14]** forms. They collect the report in the

**[00:49:17]** form of digital quotes as they know from

**[00:49:20]** the

**[00:49:22]** research they collect a report in the

**[00:49:25]** form of digital code section like

**[00:49:27]** something like that. So does we need to

**[00:49:30]** do even now most companies are simply

**[00:49:32]** uploading a PDF file on their website.

**[00:49:35]** Okay. The way we report even today is

**[00:49:39]** simple PDF file posted on our website.

**[00:49:43]** Sebi pulls out the data that's their

**[00:49:45]** business. The end result is simply a PDF

**[00:49:48]** report. So I don't want you to do the

**[00:49:50]** whole report the scope one scope two

**[00:49:54]** scope three whatever part is there in

**[00:49:56]** that sebi format you just generate.

**[00:49:58]** That's easy. Once you get that data

**[00:50:01]** entry part done creating the reports not

**[00:50:03]** much. So we'll give a big list of

**[00:50:05]** reports which you have to implement. In

**[00:50:07]** fact after this uh by today evening

**[00:50:11]** we'll send you a whatever I talked in

**[00:50:13]** this meeting I'll send a scope report

**[00:50:15]** scope of the hackathon do this that's

**[00:50:18]** not important what reports we need we'll

**[00:50:20]** give all that.

**[00:50:22]** >> Thank you sir.

**[00:50:33]** Okay, next please. Because sir just

**[00:50:35]** discussed a very interesting point. So

**[00:50:38]** let's s now I would like to bring more

**[00:50:40]** students into this please.

**[00:50:44]** >> Yeah your name your team name ask the

**[00:50:47]** question from team AIN. So my questions

**[00:50:50]** are what are the expected number of uh

**[00:50:52]** users or data and data volume. So there

**[00:50:55]** are now also the future requirements or

**[00:50:58]** planned featur planned features uh we

**[00:51:01]** should keep the system ready for.

**[00:51:05]** We have 300 projects.

**[00:51:08]** So there'll be about five to 10 users

**[00:51:11]** per project. They'll be entering data

**[00:51:13]** every day because we buy petrol every

**[00:51:16]** day, diesel every day. We are uh you

**[00:51:19]** know like maybe for water uh once in a

**[00:51:22]** month you get you get your electricity

**[00:51:24]** bill once in a month but fuel will be

**[00:51:28]** done almost every day. So 300 projects

**[00:51:31]** into 10 users into whatever number of

**[00:51:33]** entries they make. So it's pretty large

**[00:51:36]** for an entire year. This thing is done

**[00:51:39]** for a financial year. So and it has to

**[00:51:43]** continue between years. It's not that

**[00:51:45]** one year software is closed. The data

**[00:51:48]** part will continuously go on but we

**[00:51:51]** should be able to take out the report of

**[00:51:53]** that one financial year.

**[00:51:58]** >> Thank you sir.

**[00:51:59]** >> Yeah. Anyway for you you can just do a

**[00:52:02]** small local host and you you'll be

**[00:52:05]** showing it on your laptop right?

**[00:52:09]** So if you're showing on a laptop you

**[00:52:10]** create a local database and show it. But

**[00:52:13]** if you're hosting it somewhere, don't

**[00:52:15]** create a big database. Just keep a small

**[00:52:17]** database just to show us. Okay. Yeah.

**[00:52:21]** Yes, please.

**[00:52:22]** >> Thank you, sir.

**[00:52:26]** >> Good afternoon, sir.

**[00:52:28]** >> Uh I have a small query about that in

**[00:52:31]** our website. Uh we have already add

**[00:52:34]** scope one, scope two, scope three. But

**[00:52:37]** uh my question is that what the needed

**[00:52:39]** for the employment ratio, female male

**[00:52:42]** ratio and employee permanent safety is

**[00:52:46]** that needable for that website or not?

**[00:52:49]** What I told if anything else you

**[00:52:51]** implemented from the BRSR report it's

**[00:52:53]** good we'll just give some extra points

**[00:52:55]** for that. But if you have done scope

**[00:52:57]** one, scope two, scope three completed

**[00:52:59]** and you can fulfill all the kinds of

**[00:53:02]** reports we are asking. We'll send you a

**[00:53:04]** set of reports which you should show us.

**[00:53:07]** So we'll send you at the end of it. If

**[00:53:09]** you can show those reports, we're happy.

**[00:53:11]** Then we'll see your interface and the

**[00:53:13]** quality of reporting and your validation

**[00:53:16]** rules. We'll see all those kind of

**[00:53:18]** things.

**[00:53:20]** >> Okay sir. Thank you.

**[00:53:21]** >> Okay. Yeah. Next there was one more

**[00:53:25]** person.

**[00:53:32]** Sir actually am good afternoon sir. My

**[00:53:38]** question is what features are you

**[00:53:40]** exactly uh sir actually I want to ask

**[00:53:43]** what features you are expecting from us

**[00:53:46]** actually what features you

**[00:53:48]** >> features you byite

**[00:53:52]** you will give us data entry forms you

**[00:53:54]** will give us reports we want to see how

**[00:53:57]** good your software looks

**[00:54:00]** how easy is it to

**[00:54:07]** Your software is after you are done the

**[00:54:10]** database tables the balance is a piece

**[00:54:12]** of art right what your interface how

**[00:54:15]** your interface look how your reports

**[00:54:16]** look that's up to you how beautiful how

**[00:54:19]** easy you make them so we'll see that

**[00:54:24]** >> thank you sir

**[00:54:30]** >> okay sir Uh this is Somia sir from team

**[00:54:33]** upnik sir. Sir I'm asking that for the

**[00:54:36]** med evaluation of hackathon we we will

**[00:54:39]** provide our own data like simulated data

**[00:54:42]** or you will provide your company's own

**[00:54:44]** data.

**[00:54:45]** >> You add some sample data by we will not

**[00:54:48]** uh do it now

**[00:54:51]** maybe for the final evaluation we'll

**[00:54:53]** start we'll enter our own data and try

**[00:54:55]** but now you add your own data.

**[00:54:58]** >> Okay sir. Sir one more question sir that

**[00:55:01]** is sir are you really need this software

**[00:55:03]** for your company to implement?

**[00:55:06]** >> We have just signed a contract with PWC

**[00:55:09]** consultants

**[00:55:11]** to create a report for 2627 and submit

**[00:55:15]** it in April.

**[00:55:18]** >> Okay. No sir actually basically

**[00:55:20]** >> so does that answer your question and as

**[00:55:23]** I told you we are doing it on a

**[00:55:24]** voluntary basis. Okay. We submitted a

**[00:55:28]** very brief report for 2526 based on

**[00:55:32]** estimated values but that that is not

**[00:55:34]** very valuable for 2627 we want to give a

**[00:55:39]** report with all evidence documents you

**[00:55:42]** understood

**[00:55:42]** >> okay

**[00:55:43]** >> so that file attachment bills wills we

**[00:55:46]** are doing a very very serious

**[00:55:49]** uh partnership with PWC we have a team

**[00:55:52]** of about 10 people here so we are not

**[00:55:54]** doing a student project we need the

**[00:55:56]** software But if you can't make it, it's

**[00:55:57]** okay. If you make it also, we can use

**[00:56:00]** it. We do want to make use of it.

**[00:56:03]** >> We're trying to make it, sir. By the

**[00:56:04]** way, we're trying to make it. So,

**[00:56:05]** basically, we are the

**[00:56:07]** >> So, see hackathon, you're not getting

**[00:56:09]** much time. So maybe whoever you know are

**[00:56:13]** the top two three teams in hackathon,

**[00:56:15]** we'll talk to them and see if they can

**[00:56:16]** complete the whole thing by taking a bit

**[00:56:19]** more time. We'll we'll see that

**[00:56:20]** afterwards. But for the hackathon, we

**[00:56:23]** have it in November. You don't have much

**[00:56:24]** time. you have 100 other things to do

**[00:56:27]** academics girlfriends boyfriend so busy

**[00:56:31]** I'm keeping the scope a bit limited so

**[00:56:33]** that you can finish by the hackathon

**[00:56:35]** date afterwards we'll see how to take it

**[00:56:37]** for the complete software for e

**[00:56:40]** >> okay sir thank you sir

**[00:56:44]** >> hello

**[00:56:46]** >> hello

**[00:56:47]** >> yes ma'am

**[00:56:48]** >> good afternoon sir good afternoon sir

**[00:56:51]** >> I am sir for the m evaluation Do we need

**[00:56:55]** to do we need to sort the complete BRS

**[00:56:59]** report generation for the showing the

**[00:57:02]** main section or and C flow the N of the

**[00:57:06]** S

**[00:57:08]** >> the mid evaluation only a mid evaluation

**[00:57:10]** it just to give feedback so whatever you

**[00:57:12]** done we'll see we'll give feedback the

**[00:57:14]** final evaluation is where you'll get

**[00:57:16]** your first prize second price third

**[00:57:18]** price so mid evaluation we'll just see

**[00:57:21]** what you have done and if you are going

**[00:57:23]** on the wrong track we'll tell you if

**[00:57:24]** you're going the right track, we'll say

**[00:57:25]** great.

**[00:57:29]** >> Okay, sir. Thank you.

**[00:57:30]** >> Okay.

**[00:57:44]** Okay team. So if anyone is there to ask

**[00:57:47]** anything please uh do not hesitate to

**[00:57:49]** ask because after hearing this industry

**[00:57:52]** perspective of course you must have any

**[00:57:54]** ideas inside your mind. So please feel

**[00:57:56]** free to ask please.

**[00:57:58]** >> What we'll do is we'll share one email

**[00:58:01]** id for any further questions. We'll

**[00:58:04]** share one email id for any further

**[00:58:06]** questions where you can email and we'll

**[00:58:08]** we'll try to answer your question that

**[00:58:10]** time. Yes, somebody had a question.

**[00:58:16]** Sir, good evening sir. The PPD contain

**[00:58:19]** how many pages?

**[00:58:22]** >> Pardon? I couldn't catch you.

**[00:58:25]** >> Sir, the PPD contain how many pages?

**[00:58:29]** >> I didn't count, man. I'll send it to

**[00:58:31]** you. You can count it.

**[00:58:33]** I left about 40 slides in the end. Don't

**[00:58:35]** worry. They're just for informing you

**[00:58:38]** what is BRSR, what is scope and all

**[00:58:40]** that. Just I'll just send it to you. You

**[00:58:42]** can read it. Don't worry about that.

**[00:58:44]** Huh?

**[00:58:46]** That's not the specification. The specs

**[00:58:48]** are in the SEBI PDF which explains the

**[00:58:52]** actual rules and the actual format.

**[00:58:55]** This just background training for you.

**[00:58:58]** Okay. Great.

**[00:59:02]** >> Okay.

**[00:59:08]** >> Yes, madam. I think we'll close the

**[00:59:09]** session and uh any other question we'll

**[00:59:11]** take on email. Absolutely fine. We will

**[00:59:14]** uh continue to interact with the groups

**[00:59:16]** on email.

**[00:59:18]** >> Okay sir. No not an issue. Absolutely

**[00:59:21]** fine. So yeah and with that we have come

**[00:59:24]** to the end of today's session. A

**[00:59:27]** heartfelt thank you to Anuta ma'am,

**[00:59:30]** Santi ma'am uh from the mega engineering

**[00:59:32]** and infrastructure limited and of course

**[00:59:34]** a lot of thank you to Rediser for being

**[00:59:37]** with us today and sharing your valuable

**[00:59:39]** insights and experience with our

**[00:59:41]** students and uh yeah a big thank you to

**[00:59:44]** our student team also as well for

**[00:59:47]** sharing their ideas and making the

**[00:59:49]** conversation so engaging. So yeah on

**[00:59:52]** behalf of everything on behalf of Vidang

**[00:59:54]** Institute of Technology the technology

**[00:59:56]** partner for BP hackathon 2026 I wish you

**[01:00:00]** all the very best for the hackathon.

**[01:00:02]** Take the learnings from today keep

**[01:00:05]** exploring and most importantly enjoy the

**[01:00:08]** process of building and innovating.

**[01:00:10]** Thank you everyone for joining us and

**[01:00:12]** wishing you all the very best for the

**[01:00:14]** hackathon. Have a wonderful day ahead.

**[01:00:16]** Jaganat.

**[01:00:18]** Thanks.

**[01:00:18]** >> Thank you very Thank you everybody.


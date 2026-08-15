# Lab 1 — AI Use and Reflection  (fill this in)

**LLM/agent used:** <Claude, Codex>

## Selected key prompts (6–10)
| # | Prompt (summarised) | What I did with the result |
|---|---------------------|----------------------------|
| 1 | ติดตั้ง Dependencies ของ Node.js, Express และ TypeScript และตั้งค่าการเชื่อมต่อฐานข้อมูลให้สามารถเข้าถึง PostgreSQL ได้ ขั้นนี้ทำยังไง | ใช้คำสั่ง npm install และทำการสร้างไฟล์ .env |
| 2 | ทำ Issue 2 ตามใบแลปและไฟล์โค้ดที่ให้ | ทำการแก้ Backend route ใน app.ts และเชื่อมต่อ api ตามขั้นตอนที่ Claude เจนวิธีและขั้นตอนให้ โดยมีการรีเช็คทุกขั้นตอน |
| 3 | เขียน seed โดยเพิ่มชื่อหมวดหมู่ 4 ชื่อ ใช้คำสั่ง upsert โดยรันซ้ำได้โดยข้อมูลต้องไม่ซ้ำ | ทำการแก้ไฟล์ seed.ts ตามที่ AI สร้างโดยใช้คำสั่ง upsert เพื่อให้ตอนรันซ้ำไม่เกิดการ duplicate |
| 4 | เขียน GET /api/categories จาก postgreSQL โดยใช้ prisma เรียง { id, name } ตามลำดับ | ทำการแก้ไฟล์ app.ts route /api/categories |
| 5 | เขียน categories.test.ts using health.test.ts as the pattern. | ตรวจสิ่งที่ AI เจนและทำการแก้ไข categories.test ให้ตรง requirement |
| 6 | เขียน fetch ${API_URL}/api/categories return { online: true, categories }. | รีวิวและ approve โค้ด api.ts ตามที่ AI เจน ทำการเช็คไฟล์อื่นๆ ที่ AI แก้โดยไม่จำเป็นให้กลับมาเป็นเหมือนเดิม|
| 7 | edit the readme.md file to have full setup instruction according to this project | ตรวจสอบและแก้ไขไฟล์ readme.md ตามที่ AI เขียน| 

## Reflection
Two or three sentences: what made your prompts better, and one place you had to
correct or reject what the agent produced.

Overall: ต้องเขียนให้ชัดเจน และละเอียดว่าจะให้ AI ทำอะไร ตาม criteria ถ้าไม่เขียนให้ละเอียด AI จะทำการเดาแล้วเจนออกมาไม่ตรงตามที่เราต้องการ การระบุไฟล์ที่จะให้แก้ชัดเจน จะช่วยให้ AI ทำงานดีขึ้น

Prompt 1 : ทำการ Setup โปรเจกต์ด้วยตนเองเป็นส่วนใหญ่ เนื่องจากเป็นการตั้งค่าโปรเจกต์เริ่มต้น ที่ต้องมีการใช้ command line จึงต้องทำการรีเช็คและติดตั้งคำสั่งส่วนใหญ่ด้วยตนเองตามขั้นตอนที่ AI ตอบ

Prompt 2 : AI สามารถทำงานได้ถูกต้องดีในครั้งเดียว เนื่องจากเรากำหนด specific เงื่อนไขชัดเจน 

Prompt 3 : AI สามารถทำงานได้ถูกต้องดีในครั้งเดียว เนื่องจากเรากำหนด specific เงื่อนไขชัดเจน

Prompt 4 : สามารถทำงานได้ถูกต้องดีในครั้งเดียว เนื่องจากเรากำหนด specific เงื่อนไขชัดเจน task ไม่ซับซ้อน

Prompt 5 : ส่วนใหญ่ AI เขียนได้ถูกต้อง แต่ต้องปรับแก้ไขเองเล็กน้อยในส่วนที่ prompt ไม่ครอบคลุม

Prompt 6 : AI ทำการแก้ไขไฟล์ได้ถูกต้อง แต่มีการสร้างไฟล์ใหม่เองมากเกินกว่าที่ต้องการ จึงต้องมีการ undo และแก้ไขเองใหม่ อาจเป็นเพราะ prompt เราไม่ชัดเจน ทำให้ AI เดาและทำเผื่อ

Prompt 7 : AI สามารถทำงานได้ถูกต้องในครั้งเดียว เพราะเรา prompt ชัดเจน

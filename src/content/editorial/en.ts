import { ARTICLE_PUBLISHED, ARTICLE_UPDATED, type Article } from "./types";

export const enArticles: readonly Article[] = [
  {
    slug: "northern-cyprus-job-market-outlook",
    title: "The Northern Cyprus Job Market: Which Sectors Are Hiring?",
    description:
      "Which sectors in Northern Cyprus hire regularly, and which areas a job seeker should look at first.",
    category: "Job Market",
    readMinutes: 5,
    published: ARTICLE_PUBLISHED,
    updated: ARTICLE_UPDATED,
    sections: [
      {
        heading: "Where hiring concentrates",
        body: [
          "The Northern Cyprus economy rests largely on services, tourism, construction and retail. These four areas produce the employer groups you meet most often on a job board.",
          "Tourism and hospitality hire continuously through the season, especially around Kyrenia and Trikomo. Construction and building materials cluster in Nicosia and Famagusta. Retail appears in every district.",
        ],
        list: [
          "Tourism, hotels and food service",
          "Construction, building materials and technical service",
          "Retail, shop floor and sales",
          "Accounting, finance and office administration",
          "Logistics, transport and warehousing",
          "Education and healthcare",
        ],
      },
      {
        heading: "How seasonality affects a job seeker",
        body: [
          "In tourism-heavy districts the number of listings rises in spring and falls in autumn. Accounting, education and healthcare hire throughout the year.",
          "Knowing the seasonal pattern helps you plan when to apply. Applying before the summer season is an advantage with tourism employers.",
        ],
      },
      {
        heading: "Which skills stand out",
        body: [
          "The qualities employers ask for most often are communication, teamwork and basic computer literacy. In customer-facing roles, English is a clear advantage.",
          "Accounting and office roles frequently ask for familiarity with local accounting software. Technical roles reward professional certificates.",
        ],
      },
      {
        heading: "What this means for a job seeker",
        body: [
          "Rather than committing to one sector, consider the neighbouring areas your skills can move into. Retail experience, for example, also suits customer service and sales support roles.",
          "Following listings consistently matters: new roles are posted through the week, and applying early improves your visibility.",
        ],
      },
    ],
  },
  {
    slug: "how-to-post-a-job-in-northern-cyprus",
    title: "For Employers: How to Write an Effective Job Ad in Northern Cyprus",
    description:
      "How to write a listing that attracts the right candidate, which details are essential, and the mistakes to avoid.",
    category: "Employers",
    readMinutes: 5,
    published: ARTICLE_PUBLISHED,
    updated: ARTICLE_UPDATED,
    sections: [
      {
        heading: "Open with a clear title",
        body: [
          "Candidates read the title first. Instead of a generic \"staff wanted\", name the role directly: \"Accountant\", \"Retail Sales Assistant\", \"Construction Technician\".",
          "Because candidates search by job title, the words in your title directly affect whether your listing is found.",
        ],
      },
      {
        heading: "The essential details",
        body: [
          "Give the information a candidate needs to decide whether to apply. An incomplete listing is why suitable people do not apply.",
        ],
        list: [
          "The full job title",
          "Where the work is (district, and the area if possible)",
          "Employment type and arrangement (full-time, hybrid, and so on)",
          "Duties and responsibilities",
          "The requirements",
          "How to apply and any closing date",
        ],
      },
      {
        heading: "Publishing the salary works in your favour",
        body: [
          "Listings that share a salary range tend to receive better-qualified, more committed applications. If expectations and budget do not match from the start, the process wastes time on both sides.",
          "If you prefer not to publish a figure, at least be ready to give a clear range at interview.",
        ],
      },
      {
        heading: "The mistakes to avoid",
        body: [
          "The points candidates complain about most are the ones that drag out the process and erode trust.",
        ],
        list: [
          "Never replying to applications",
          "Leaving a listing live for months without updating it",
          "A vague description of the duties",
          "Overstating the requirements",
          "Not saying how to apply",
          "Not closing the listing once the role is filled",
        ],
      },
      {
        heading: "Review applications regularly",
        body: [
          "Once the listing is live, check applications often and respond quickly. A fast reply is how you avoid losing good candidates.",
          "Closing the listing when the role is filled stops people applying in vain and keeps the platform current.",
        ],
      },
    ],
  },
  {
    slug: "first-job-guide-for-graduates",
    title: "A Graduate's Guide to a First Job in Northern Cyprus",
    description:
      "What candidates with no experience should do to find a first job in Northern Cyprus, and which doors to knock on.",
    category: "Career Tips",
    readMinutes: 5,
    published: ARTICLE_PUBLISHED,
    updated: ARTICLE_UPDATED,
    sections: [
      {
        heading: "The advantages a candidate without experience has",
        body: [
          "A lack of experience looks like a barrier, but some employers are looking for exactly that: someone open to learning, trainable and likely to stay. Internship and part-time listings exist for that need.",
          "Projects from your studies, volunteering, student societies and short-term work all count as experience. Put them on your CV.",
        ],
      },
      {
        heading: "Which roles to target first",
        body: [
          "Realistic starting points for a first job are the customer-facing roles that can be learned on the job.",
        ],
        list: [
          "Retail sales assistant and cashier",
          "Call centre and customer service",
          "Office and front desk assistant",
          "Internship programmes",
          "Warehouse and logistics support",
          "Tourism and food service roles",
        ],
      },
      {
        heading: "Do not leave the CV empty",
        body: [
          "Even when the experience section is short, the CV should not look blank. Education, certificates, languages, computer skills and the projects you took part in fill that space.",
          "A short \"About me\" section lets you say in two or three lines what you are looking for and what you can do.",
        ],
      },
      {
        heading: "Use your network",
        body: [
          "In Northern Cyprus many jobs are filled through a familiar circle before they are ever advertised. Your family, friends, lecturers and your school's careers office are part of that network.",
          "Saying openly that you are looking for work often opens doors you did not know existed.",
        ],
      },
      {
        heading: "Treat the first job as a step",
        body: [
          "A first job is the start of a career, not the end of it. The experience, references and skills you gain there make the move to the next role easier.",
          "Rather than waiting for the perfect job and applying to nothing, starting with a role that teaches you something is usually the better route.",
        ],
      },
    ],
  },
];

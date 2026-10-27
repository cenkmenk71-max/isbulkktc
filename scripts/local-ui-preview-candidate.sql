insert into public.candidate_profiles (
  user_id,
  headline,
  location,
  skills,
  experience,
  education,
  languages,
  certifications
)
select
  id,
  'Junior product designer',
  'Kyrenia',
  array['Product design', 'Figma', 'Accessibility'],
  '[{"role":"Product design intern","organization":"Northstar Studio","location":"Kyrenia","startDate":"2024","endDate":"2025","description":"Created accessible interface prototypes and supported user research."}]'::jsonb,
  '[{"institution":"Eastern Mediterranean University","qualification":"BA","field":"Visual Communication Design","startDate":"2020","endDate":"2024","description":""}]'::jsonb,
  '[{"name":"Turkish","proficiency":"Native"},{"name":"English","proficiency":"Advanced"}]'::jsonb,
  '[{"name":"Accessible UX Foundations","issuer":"Example Learning Institute","issueDate":"2025","expiryDate":""}]'::jsonb
from auth.users
where email = 'local-demo-candidate@example.test'
on conflict (user_id) do update
set
  headline = excluded.headline,
  location = excluded.location,
  skills = excluded.skills,
  experience = excluded.experience,
  education = excluded.education,
  languages = excluded.languages,
  certifications = excluded.certifications

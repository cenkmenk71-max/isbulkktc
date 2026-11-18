# Package Cards WhatsApp/Email Implementation Plan

## Goal
Add WhatsApp and email contact buttons to each package card in the job packages page, and enhance the visual design of the cards to be more professional while maintaining white color scheme.

## Current Structure
- Package cards are rendered in `src/components/packages/packages-experience.tsx` (lines 149-188)
- WhatsApp/email buttons are implemented in `src/experience/scenes/vend-pricing/components/Panel.tsx` (lines 145-155)
- Social links utilities are in `src/lib/social-links.ts`

## Implementation Steps

### 1. Extract WhatsApp/Email Button Logic
- Create reusable WhatsApp and email button components using the UI Button component with 'inverse' variant
- Use the same social links utilities (`getWhatsAppUrl()`, `getSupportMailto()`) for consistency
- Buttons will have white background with dark text to match the 'white color scheme' requirement

### 2. Enhance Package Card Design
- Update cards to use pure white background (`#ffffff`) instead of current off-white
- Add tier-specific visual indicators using `packageTierColors` for professional appearance
- Improve typography hierarchy with better font weights and spacing
- Add interactive states (hover, focus) for better UX
- Maintain WCAG contrast compliance following existing project standards

### 3. Add Contact Buttons to Package Cards
- Add WhatsApp and email buttons to each package card using the new 'inverse' button components
- Position buttons prominently below pricing information
- Ensure consistent styling with existing Panel buttons while using white color scheme

### 4. Update Package Card Layout
- Replace current simple list items with enhanced card components
- Add proper hover/focus states for interactivity
- Ensure responsive design works across all screen sizes
- Maintain existing grid layout but enhance individual card styling

### 5. Validation
- Verify all WhatsApp/email links work correctly
- Test accessibility (keyboard navigation, screen readers, contrast ratios)
- Confirm visual design meets professional standards
- Run lint, typecheck, and tests

## Files to Modify
- `src/components/packages/packages-experience.tsx` - Update package card rendering
- `src/components/packages/package-tiers.ts` - May need additional exports for styling
- Create new components: `src/components/packages/whatsapp-button.tsx`, `src/components/packages/email-button.tsx`

## Dependencies
- Social links utilities already exist in `src/lib/social-links.ts`
- Package tier colors available in `src/components/packages/package-tiers.ts`
- Button styling conventions from `src/components/ui/button.tsx`
- Existing white background styling from `src/styles/global.css` (lines 7785-7794)

## Success Criteria
- Each package card has prominent WhatsApp and email buttons using 'inverse' button variant
- Cards have professional, modern design with pure white background and tier indicators
- All functionality works correctly across locales
- No visual regressions in existing functionality
- All tests pass
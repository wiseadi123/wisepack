/**
 * Wisepack Landing Page JavaScript Logic
 * - Tool category selection & auto-fill
 * - Form validation (Israeli phone number formatting & checks)
 * - Anti-double-submit & lead generation
 * - LocalStorage lead persistence
 * - Success modal with custom WhatsApp deep link
 * - Accessible FAQ Accordion
 * - Privacy & Terms modals
 * - Analytics tracking events
 */

document.addEventListener('DOMContentLoaded', () => {
  const SALES_PHONE_RAW = '0509611808';
  const SALES_PHONE_INTL = '972509611808';

  // --- Analytics Event Tracker ---
  function trackEvent(eventName, eventParams = {}) {
    try {
      console.log(`[Wisepack Analytics] Event: ${eventName}`, eventParams);
      if (typeof window.gtag === 'function') {
        window.gtag('event', eventName, eventParams);
      }
      if (window.dataLayer && Array.isArray(window.dataLayer)) {
        window.dataLayer.push({ event: eventName, ...eventParams });
      }
    } catch (e) {
      console.warn('Analytics tracking error:', e);
    }
  }

  // --- Elements ---
  const leadForm = document.getElementById('leadForm');
  const fullNameInput = document.getElementById('fullName');
  const phoneInput = document.getElementById('phone');
  const toolTypeSelect = document.getElementById('toolType');
  const descTextarea = document.getElementById('description');
  const whatsappConsentCheck = document.getElementById('whatsappConsent');
  const submitLeadBtn = document.getElementById('submitLeadBtn');

  const successModal = document.getElementById('successModal');
  const successLeadIdEl = document.getElementById('successLeadId');
  const successClientNameEl = document.getElementById('successClientName');
  const successModalWhatsappBtn = document.getElementById('successModalWhatsappBtn');

  // --- Tool Category Buttons (Click -> Auto-select in form) ---
  const toolChips = document.querySelectorAll('.tool-chip');
  toolChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const chipVal = chip.getAttribute('data-chip');
      toolChips.forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      if (toolTypeSelect) {
        toolTypeSelect.value = chipVal;
        clearFieldError('toolType');
      }
      trackEvent('select_tool_chip', { tool: chipVal });
    });
  });

  // --- Toggle Optional Details ---
  const toggleDetailsBtn = document.getElementById('toggleDetailsBtn');
  const detailsCollapse = document.getElementById('detailsCollapse');
  if (toggleDetailsBtn && detailsCollapse) {
    toggleDetailsBtn.addEventListener('click', () => {
      const isHidden = detailsCollapse.style.display === 'none';
      detailsCollapse.style.display = isHidden ? 'block' : 'none';
      const icon = toggleDetailsBtn.querySelector('.plus-icon');
      if (icon) icon.textContent = isHidden ? '−' : '+';
      if (isHidden && descTextarea) {
        descTextarea.focus();
      }
    });
  }

  const toolButtons = document.querySelectorAll('.tool-card');
  toolButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const selectedTool = btn.getAttribute('data-tool');
      if (selectedTool) {
        // Highlight active card
        toolButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Update form chips & dropdown
        toolChips.forEach(c => {
          if (c.getAttribute('data-chip') === selectedTool) {
            c.classList.add('selected');
          } else {
            c.classList.remove('selected');
          }
        });

        if (toolTypeSelect) {
          toolTypeSelect.value = selectedTool;
          clearFieldError('toolType');
        }

        trackEvent('select_tool_category', { tool: selectedTool });

        // Smooth scroll to form
        const contactSection = document.getElementById('contact');
        if (contactSection) {
          contactSection.scrollIntoView({ behavior: 'smooth' });
        }
      }
    });
  });

  // --- Service Card Triggers ---
  const serviceTriggers = document.querySelectorAll('.select-service-trigger');
  serviceTriggers.forEach(link => {
    link.addEventListener('click', (e) => {
      const serviceName = link.getAttribute('data-service');
      if (descTextarea && serviceName) {
        if (!descTextarea.value.includes(serviceName)) {
          descTextarea.value = serviceName + ': ' + descTextarea.value;
        }
      }
      trackEvent('click_service_card', { service: serviceName });
    });
  });

  // --- Phone Validation & Cleaning ---
  function sanitizePhone(raw) {
    if (!raw) return '';
    return raw.replace(/[\s\-\(\)\.]/g, '');
  }

  function isValidIsraeliPhone(raw) {
    const clean = sanitizePhone(raw);
    // Matches 05XXXXXXXX, or +9725XXXXXXXX, or 9725XXXXXXXX
    const isrPattern = /^(?:05[0-9]{8}|(?:\+?972)5[0-9]{8})$/;
    return isrPattern.test(clean);
  }

  // Auto-format phone input on blur
  phoneInput?.addEventListener('blur', () => {
    let val = phoneInput.value.trim();
    const clean = sanitizePhone(val);
    if (/^05[0-9]{8}$/.test(clean)) {
      phoneInput.value = `${clean.slice(0, 3)}-${clean.slice(3)}`;
    }
  });

  // --- Field Validation Helpers ---
  function showFieldError(fieldId, errorMsg) {
    const group = document.getElementById(`group-${fieldId}`);
    const errorEl = document.getElementById(`error-${fieldId}`);
    if (group) group.classList.add('has-error');
    if (errorEl && errorMsg) errorEl.textContent = errorMsg;
  }

  function clearFieldError(fieldId) {
    const group = document.getElementById(`group-${fieldId}`);
    if (group) group.classList.remove('has-error');
  }

  // Clear errors upon typing/changing
  fullNameInput?.addEventListener('input', () => clearFieldError('name'));
  phoneInput?.addEventListener('input', () => clearFieldError('phone'));
  toolTypeSelect?.addEventListener('change', () => clearFieldError('toolType'));

  // --- Form Submission Handling ---
  if (leadForm) {
    leadForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      let hasError = false;

      // 1. Name validation
      const fullName = fullNameInput.value.trim();
      if (!fullName || fullName.length < 2) {
        showFieldError('name', 'נא להזין שם מלא תקין (לפחות 2 תווים)');
        hasError = true;
      } else {
        clearFieldError('name');
      }

      // 2. Phone validation
      const phone = phoneInput.value.trim();
      if (!phone || !isValidIsraeliPhone(phone)) {
        showFieldError('phone', 'נא להזין מספר טלפון נייד תקין (למשל: 050-9611808)');
        hasError = true;
      } else {
        clearFieldError('phone');
      }

      // 3. Tool Type validation
      const toolType = toolTypeSelect.value;
      if (!toolType) {
        showFieldError('toolType', 'נא לבחור את סוג הכלי מהרשימה');
        hasError = true;
      } else {
        clearFieldError('toolType');
      }

      if (hasError) {
        trackEvent('submit_lead_error', { reason: 'validation_failed' });
        // Focus first errored field
        const firstError = leadForm.querySelector('.has-error input, .has-error select');
        if (firstError) firstError.focus();
        return;
      }

      // Double submit prevention
      submitLeadBtn.disabled = true;
      submitLeadBtn.classList.add('is-loading');

      const now = new Date();
      let finalLeadId = `#1004`;

      const leadData = {
        fullName,
        phone,
        toolType,
        description: descTextarea.value.trim() || 'לא צוין פירוט נוסף',
        whatsappConsent: whatsappConsentCheck.checked,
        status: 'חדש',
        source: 'landing_page_form'
      };

      // Send to backend API
      try {
        const response = await fetch('/api/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(leadData)
        });
        if (response.ok) {
          const resJson = await response.json();
          if (resJson.leadId) {
            finalLeadId = resJson.leadId;
          }
        }
      } catch (err) {
        console.log('Static mode or API not active:', err);
      }

      // Persist in localStorage with friendly ID
      try {
        leadData.id = finalLeadId;
        const storedLeads = JSON.parse(localStorage.getItem('wisepack_leads') || '[]');
        storedLeads.unshift(leadData);
        localStorage.setItem('wisepack_leads', JSON.stringify(storedLeads));
      } catch (err) {
        console.warn('Could not store lead to localStorage:', err);
      }

      // Smooth UX transition
      await new Promise(resolve => setTimeout(resolve, 300));

      // Track lead success event
      trackEvent('submit_lead_success', {
        lead_id: finalLeadId,
        tool_type: toolType,
        whatsapp_consent: leadData.whatsappConsent
      });

      // Prepare Success Modal
      if (successLeadIdEl) successLeadIdEl.textContent = finalLeadId;
      if (successClientNameEl) successClientNameEl.textContent = fullName;

      // Prepare custom WhatsApp link in success modal with friendly ID
      if (successModalWhatsappBtn) {
        const waText = `שלום Wisepack, השארתי פנייה באתר (פנייה ${finalLeadId}) עבור ${toolType}. מצורפת תמונה של הסוללה/הכלי לבדיקה:`;
        successModalWhatsappBtn.href = `https://wa.me/${SALES_PHONE_INTL}?text=${encodeURIComponent(waText)}`;
      }

      // Open Success Modal
      openModal(successModal);

      // Reset form & restore button
      leadForm.reset();
      toolButtons.forEach(b => b.classList.remove('active'));
      submitLeadBtn.disabled = false;
      submitLeadBtn.classList.remove('is-loading');
    });
  }

  // --- Modal System ---
  function openModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.remove('active');
    document.body.style.overflow = '';
  }

  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal');
      closeModal(modal);
    });
  });

  document.querySelectorAll('.modal').forEach(modal => {
    const backdrop = modal.querySelector('.modal-backdrop');
    backdrop?.addEventListener('click', () => closeModal(modal));
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal.active').forEach(modal => closeModal(modal));
    }
  });

  // Legal Modals Triggers
  const privacyModal = document.getElementById('privacyModal');
  const termsModal = document.getElementById('termsModal');
  const accessibilityModal = document.getElementById('accessibilityModal');

  document.querySelectorAll('.open-privacy-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openModal(privacyModal);
    });
  });

  document.querySelectorAll('.open-terms-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openModal(termsModal);
    });
  });

  document.querySelectorAll('.open-access-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openModal(accessibilityModal);
    });
  });

  // --- FAQ Accordion ---
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const questionBtn = item.querySelector('.faq-question');
    questionBtn?.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');

      // Close all other open items
      faqItems.forEach(otherItem => {
        if (otherItem !== item) {
          otherItem.classList.remove('open');
          const otherBtn = otherItem.querySelector('.faq-question');
          if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');
        }
      });

      // Toggle current
      if (isOpen) {
        item.classList.remove('open');
        questionBtn.setAttribute('aria-expanded', 'false');
      } else {
        item.classList.add('open');
        questionBtn.setAttribute('aria-expanded', 'true');
        trackEvent('faq_open', { question: questionBtn.textContent.trim() });
      }
    });
  });

  // --- Click Analytics on Call & WhatsApp ---
  document.querySelectorAll('a[href^="tel:"]').forEach(link => {
    link.addEventListener('click', () => {
      trackEvent('click_call', { phone: link.getAttribute('href') });
    });
  });

  document.querySelectorAll('a[href*="wa.me"]').forEach(link => {
    link.addEventListener('click', () => {
      trackEvent('click_whatsapp', { url: link.getAttribute('href') });
    });
  });

  // Lead admin shortcut helper (Ctrl + Shift + L)
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'l') {
      const leads = JSON.parse(localStorage.getItem('wisepack_leads') || '[]');
      console.table(leads);
      alert(`Wisepack: קיימות ${leads.length} פניות ב-localStorage. הפירוט הודפס לקונסול (F12).`);
    }
  });
});

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

  // --- Dynamic Tool Types Loading from API / MongoDB ---
  async function loadToolTypes() {
    if (!toolTypeSelect) return;
    try {
      const res = await fetch('/api/tool-types');
      if (res.ok) {
        const data = await res.json();
        const types = data.toolTypes || [];
        if (Array.isArray(types) && types.length > 0) {
          const currentVal = toolTypeSelect.value;
          toolTypeSelect.innerHTML = '<option value="" disabled selected>בחרו את סוג הכלי שלכם...</option>';
          types.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item;
            opt.textContent = item;
            toolTypeSelect.appendChild(opt);
          });
          if (currentVal && types.includes(currentVal)) {
            toolTypeSelect.value = currentVal;
          }
        }
      }
    } catch (err) {
      console.warn('Could not load dynamic tool types:', err);
    }
  }
  loadToolTypes();

  // --- Mobile Services Segmented Tab Switcher ---
  const serviceTabBtns = document.querySelectorAll('.service-tab-btn');
  const mobileCard = document.getElementById('serviceMobileCard');
  const mobileBadge = document.getElementById('mobileCardBadge');
  const mobileIcon = document.getElementById('mobileCardIcon');
  const mobileTitle = document.getElementById('mobileCardTitle');
  const mobileSubtag = document.getElementById('mobileCardSubtag');
  const mobileDesc = document.getElementById('mobileCardDesc');
  const mobileCta = document.getElementById('mobileCardCta');

  const SERVICE_DATA = {
    build: {
      badge: false,
      isFeatured: false,
      icon: `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`,
      title: 'ייצור סוללות בהתאמה אישית',
      subtag: 'סוללות ליתיום חדשות באיכות פרימיום',
      desc: 'זקוקים לסוללה חדשה? נבדוק את דרישות הכלי והשימוש ונבחן פתרון מתאים מבית Wisepack עם 12 חודשי אחריות.',
      ctaText: 'פנייה לבדיקת ייצור סוללה',
      ctaHref: '#contact',
      isWa: false,
      serviceName: 'ייצור סוללות בהתאמה אישית'
    },
    repair: {
      badge: 'פנייה שכיחה',
      isFeatured: true,
      icon: `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
      title: 'תיקון וחידוש סוללות',
      subtag: 'איתור תקלות מעבדתי והחלפת תאים',
      desc: 'הסוללה לא נטענת או אינה מתפקדת כרגיל? פנו אלינו לבירור ולבדיקת אפשרות תיקון במעבדה עם 3 חודשי אחריות.',
      ctaText: 'בדיקת אפשרות לתיקון סוללה',
      ctaHref: '#contact',
      isWa: false,
      serviceName: 'תיקון סוללות'
    },
    custom: {
      badge: false,
      isFeatured: false,
      icon: `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>`,
      title: 'התאמה לכלים ומכשירים נוספים',
      subtag: 'שואבי אבק, רחפנים, כלי עבודה ועוד',
      desc: 'לא מצאתם את המכשיר שלכם ברשימה? מלאו פרטים בטופס ונבדוק במעבדה כיצד נוכל לעזור.',
      ctaText: 'פנייה לבדיקת התאמה מיוחדת',
      ctaHref: '#contact',
      isWa: false,
      serviceName: 'התאמה לכלים נוספים'
    }
  };

  serviceTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabKey = btn.getAttribute('data-tab');
      const data = SERVICE_DATA[tabKey];
      if (!data) return;

      // Update active tab button
      serviceTabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update card content with smooth transition
      if (mobileCard) {
        mobileCard.style.opacity = '0.35';
        mobileCard.style.transform = 'translateY(4px)';

        setTimeout(() => {
          if (data.isFeatured) {
            mobileCard.classList.add('featured-card');
          } else {
            mobileCard.classList.remove('featured-card');
          }

          if (mobileBadge) {
            if (data.badge) {
              mobileBadge.textContent = data.badge;
              mobileBadge.style.display = 'block';
            } else {
              mobileBadge.style.display = 'none';
            }
          }

          if (mobileIcon) mobileIcon.innerHTML = data.icon;
          if (mobileTitle) mobileTitle.textContent = data.title;
          if (mobileSubtag) mobileSubtag.textContent = data.subtag;
          if (mobileDesc) mobileDesc.textContent = data.desc;

          if (mobileCta) {
            const spanText = mobileCta.querySelector('span');
            if (spanText) spanText.textContent = data.ctaText;
            mobileCta.href = data.ctaHref;
            mobileCta.setAttribute('data-service', data.serviceName);

            if (data.isWa) {
              mobileCta.className = 'btn btn-whatsapp btn-block';
              mobileCta.target = '_blank';
              mobileCta.rel = 'noopener';
            } else {
              mobileCta.className = 'btn btn-primary btn-block select-service-trigger';
              mobileCta.removeAttribute('target');
              mobileCta.removeAttribute('rel');
            }
          }

          mobileCard.style.opacity = '1';
          mobileCard.style.transform = 'translateY(0)';
        }, 120);
      }

      trackEvent('switch_service_tab', { tab: tabKey });
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

        if (toolTypeSelect) {
          toolTypeSelect.value = selectedTool;
          clearFieldError('toolType');
        }

        trackEvent('select_tool_category', { tool: selectedTool });

        // Smooth scroll to form
        const contactSection = document.getElementById('contact');
        if (contactSection) {
          contactSection.scrollIntoView({ behavior: 'smooth' });
          if (toolTypeSelect) toolTypeSelect.focus();
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

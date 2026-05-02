/**
 * Lightweight i18n dictionary.
 *
 * Two locales: `de` (default) + `en`. Adding more locales = add a key under
 * each `Messages` object below. Keys that aren't translated for a locale
 * fall back to the German string at runtime via `t()`.
 *
 * Wiring: `LocaleProvider` wraps the app and exposes `useT()`. Server
 * components don't have access to the live locale, so they keep using
 * German strings for now (login page, etc., still have hardcoded German
 * — the toggle effects only render after the client mounts).
 */

export type Locale = "de" | "en";

export const SUPPORTED_LOCALES: Locale[] = ["de", "en"];
export const DEFAULT_LOCALE: Locale = "de";

export type Messages = {
  // ─── Common ──────────────────────────────────────────────────────────
  "common.loading": string;
  "common.save": string;
  "common.cancel": string;
  "common.delete": string;
  "common.edit": string;
  "common.close": string;
  "common.search": string;
  "common.refresh": string;
  "common.open": string;
  "common.back": string;
  "common.new": string;
  "common.send": string;
  "common.reply": string;
  "common.replyAll": string;
  "common.forward": string;
  "common.settings": string;
  "common.filter": string;
  "common.more": string;
  "common.all": string;
  "common.none": string;
  "common.empty": string;
  "common.noResults": string;
  "common.noEntries": string;
  "common.error": string;
  "common.retry": string;
  "common.upload": string;
  "error.workspaceTitle": string;
  "error.workspaceLead": string;
  "error.retry": string;
  "error.reloadPage": string;
  "common.download": string;
  "common.copy": string;
  "common.copied": string;
  "common.create": string;
  "common.add": string;
  "common.remove": string;
  "common.confirm": string;
  "common.yes": string;
  "common.no": string;
  "common.from": string;
  "common.to": string;
  "common.subject": string;
  "common.date": string;
  "common.status": string;
  "common.priority": string;
  "common.assignee": string;
  "common.author": string;
  "common.title": string;
  "common.description": string;
  "common.notes": string;
  "common.attachments": string;
  "common.activity": string;
  "common.details": string;
  "common.today": string;
  "common.yesterday": string;
  "common.dateUnknown": string;
  "common.openInNewTab": string;
  "common.reload": string;
  "common.thisWeek": string;
  "common.relative.justNow": string;
  "common.relative.minutesAgo": string;
  "common.relative.hoursAgo": string;
  "common.relative.daysAgoOne": string;
  "common.relative.daysAgoMany": string;
  "common.menu.open": string;
  "common.menu.close": string;

  // ─── Login ───────────────────────────────────────────────────────────
  "login.heading": string;
  "login.subtitle": string;
  "login.cta": string;
  "login.divider": string;
  "login.help": string;
  "login.problems": string;
  "login.subline": string;
  "login.cardTitle": string;
  "login.errorPrefix": string;
  "login.brandBar": string;
  "login.internalBadge": string;

  // ─── Sidebar / Apps ──────────────────────────────────────────────────
  "nav.dashboard": string;
  "nav.mail": string;
  "nav.chat": string;
  "nav.calendar": string;
  "nav.calls": string;
  "nav.files": string;
  "nav.gapReport": string;
  "nav.office": string;
  "nav.crm": string;
  "nav.helpdesk": string;
  "nav.projects": string;
  "nav.sign": string;
  "nav.code": string;
  "nav.status": string;
  "nav.identity": string;
  "nav.proxy": string;
  "nav.admin": string;
  "nav.onboarding": string;
  "nav.opsDashboard": string;
  "nav.marketing": string;
  "nav.aiKnowledge": string;
  "nav.dashboard.short": string;
  "nav.badge.soon": string;

  "sidebar.healthUnknown": string;
  "sidebar.healthAllUp": string;
  "sidebar.healthPartialDown": string;
  "sidebar.healthLastCheck": string;

  "pulse.titleWithWorkspace": string;
  "pulse.titleDefault": string;
  "pulse.updated": string;
  "pulse.mail.unread": string;
  "pulse.mail.hintTotal": string;
  "pulse.mail.inboxEmpty": string;
  "pulse.mail.offlineHint": string;
  "pulse.tasks.today": string;
  "pulse.tasks.notInWorkspace": string;
  "pulse.tasks.noProjects": string;
  "pulse.tasks.openAssigned": string;
  "pulse.tasks.apiUnreachable": string;
  "pulse.chat.label": string;
  "pulse.chat.hint": string;
  "pulse.feed.label": string;
  "pulse.feed.empty": string;
  "pulse.feed.hintSignCompleted": string;
  "pulse.feed.hubSign": string;
  "pulse.feed.hubHelpdesk": string;
  "pulse.feed.hubCrm": string;
  "pulse.feed.hubProjects": string;
  "pulse.feed.hubOffice": string;
  "pulse.feed.hubCalendar": string;
  "pulse.feed.hubCommunication": string;
  "pulse.feed.hubDefault": string;

  "dash.inbox.title": string;
  "dash.inbox.loadingSnapshot": string;
  "dash.inbox.allDone": string;
  "dash.inbox.waitingMany": string;
  "dash.inbox.loading": string;
  "dash.inbox.mailUnread": string;
  "dash.inbox.allFoldersHint": string;
  "dash.inbox.ticketsOpen": string;
  "dash.inbox.ticketsWithSla": string;
  "dash.inbox.ticketsNoSla": string;
  "dash.inbox.slaRisk": string;
  "dash.inbox.slaRiskHint": string;
  "dash.inbox.helpdeskDisabled": string;

  "dash.myIssues.title": string;
  "dash.myIssues.loadingSnapshot": string;
  "dash.myIssues.loadingShort": string;
  "dash.myIssues.subtitleOverdueLine": string;
  "dash.myIssues.subtitleDueToday": string;
  "dash.myIssues.subtitleOpenNoDue": string;
  "dash.myIssues.inboxZero": string;
  "dash.myIssues.emptyBody": string;
  "dash.myIssues.moreCount": string;
  "dash.myIssues.priorityTitle": string;
  "dash.myIssues.due.today": string;
  "dash.myIssues.due.yesterday": string;
  "dash.myIssues.due.tomorrow": string;
  "dash.myIssues.due.daysAgo": string;
  "dash.myIssues.due.daysIn": string;

  "dash.quickCapture.openAria": string;
  "dash.quickCapture.toggleTitle": string;
  "dash.quickCapture.heading": string;
  "dash.quickCapture.savedCount": string;
  "dash.quickCapture.placeholder": string;
  "dash.quickCapture.keyboardHints": string;
  "dash.quickCapture.save": string;

  "portal.helpdeskPublic.replySent": string;
  "portal.helpdeskPublic.statusPrefix": string;
  "portal.helpdeskPublic.priorityPrefix": string;
  "portal.helpdeskPublic.metaOpenedUpdated": string;
  "portal.helpdeskPublic.refreshTitle": string;
  "portal.helpdeskPublic.refreshing": string;
  "portal.helpdeskPublic.refresh": string;
  "portal.helpdeskPublic.noArticles": string;
  "portal.helpdeskPublic.replyHeading": string;
  "portal.helpdeskPublic.replyPlaceholder": string;
  "portal.helpdeskPublic.linkExpires": string;
  "portal.helpdeskPublic.sending": string;
  "portal.helpdeskPublic.sendReply": string;
  "portal.helpdeskPublic.footerMagicLink": string;
  "portal.helpdeskPublic.unknownAuthor": string;

  "dash.greeting.morning": string;
  "dash.greeting.day": string;
  "dash.greeting.evening": string;
  "dash.greeting.night": string;
  "dash.quick.title": string;
  "dash.quick.subtitle": string;
  "dash.tips.heading": string;

  "dash.followups.title": string;
  "dash.followups.busy": string;
  "dash.followups.ready": string;
  "dash.followups.empty": string;
  "dash.followups.summaryOne": string;
  "dash.followups.summaryMany": string;
  "dash.followups.thresholdTitle": string;
  "dash.followups.comparing": string;
  "dash.followups.allClear": string;
  "dash.followups.recipientPrefix": string;
  "dash.followups.mailLink": string;

  "dash.mentions.title": string;
  "dash.mentions.loading": string;
  "dash.mentions.ready": string;
  "dash.mentions.empty": string;
  "dash.mentions.summaryOne": string;
  "dash.mentions.summaryMany": string;
  "dash.mentions.refresh": string;
  "dash.mentions.chatLink": string;
  "dash.mentions.emptyHint": string;
  "dash.mentions.breakdownTooltip": string;
  "dash.mentions.unreadInline": string;
  "dash.mentions.directInline": string;
  "dash.mentions.groupInline": string;

  "dash.hub.communication.title": string;
  "dash.hub.office.title": string;
  "dash.hub.project.title": string;

  "dash.corehub.communication.blurb": string;
  "dash.corehub.office.blurb": string;
  "dash.corehub.project.blurb": string;
  "dash.corehub.hint.mail": string;
  "dash.corehub.hint.chat": string;
  "dash.corehub.hint.calendar": string;
  "dash.corehub.hint.calls": string;
  "dash.corehub.hint.files": string;
  "dash.corehub.hint.office": string;
  "dash.corehub.hint.sign": string;
  "dash.corehub.hint.crm": string;
  "dash.corehub.hint.aiKnowledge": string;
  "dash.corehub.hint.projects": string;
  "dash.corehub.hint.code": string;

  "dash.medtheris.communication.blurb": string;
  "dash.medtheris.office.blurb": string;
  "dash.medtheris.project.blurb": string;
  "dash.medtheris.hint.mail": string;
  "dash.medtheris.hint.chat": string;
  "dash.medtheris.hint.calendar": string;
  "dash.medtheris.hint.calls": string;
  "dash.medtheris.hint.helpdesk": string;
  "dash.medtheris.hint.files": string;
  "dash.medtheris.hint.office": string;
  "dash.medtheris.hint.crm": string;
  "dash.medtheris.hint.marketing": string;
  "dash.medtheris.hint.sign": string;
  "dash.medtheris.hint.aiKnowledge": string;
  "dash.medtheris.hint.projects": string;

  "dash.kineo.communication.blurb": string;
  "dash.kineo.office.blurb": string;
  "dash.kineo.project.blurb": string;
  "dash.kineo.hint.mail": string;
  "dash.kineo.hint.chat": string;
  "dash.kineo.hint.calls": string;
  "dash.kineo.hint.calendar": string;
  "dash.kineo.hint.helpdesk": string;
  "dash.kineo.hint.files": string;
  "dash.kineo.hint.office": string;
  "dash.kineo.hint.crm": string;
  "dash.kineo.hint.sign": string;
  "dash.kineo.hint.aiKnowledge": string;
  "dash.kineo.hint.projects": string;

  "dash.corehub.tip1": string;
  "dash.corehub.tip2": string;
  "dash.corehub.tip3": string;
  "dash.medtheris.tip1": string;
  "dash.medtheris.tip2": string;
  "dash.medtheris.tip3": string;
  "dash.kineo.tip1": string;
  "dash.kineo.tip2": string;
  "dash.kineo.tip3": string;

  "section.overview": string;
  "section.communication": string;
  "section.officeHub": string;
  "section.projectHub": string;
  "section.system": string;

  // ─── User menu ───────────────────────────────────────────────────────
  "menu.signedInAs": string;
  "menu.account": string;
  "menu.mfaPassword": string;
  "menu.theme": string;
  "menu.language": string;
  "menu.refresh": string;
  "menu.logout": string;
  "menu.fullLogout.title": string;
  "menu.fullLogout.subtitle": string;
  "menu.fullLogout.action": string;
  "menu.logoutPortalOnly.title": string;

  // ─── Workspace switcher ──────────────────────────────────────────────
  "workspace.switcher": string;
  "workspace.search": string;

  // ─── Calendar ────────────────────────────────────────────────────────
  "calendar.newEvent": string;
  "calendar.title": string;
  "calendar.start": string;
  "calendar.end": string;
  "calendar.location": string;
  "calendar.description": string;
  "calendar.allDay": string;
  "calendar.today": string;
  "calendar.month": string;
  "calendar.week": string;
  "calendar.day": string;
  "calendar.video.add": string;
  "calendar.video.remove": string;
  "calendar.video.label": string;
  "calendar.video.hint": string;
  "calendar.video.join": string;
  "calendar.defaultTitle": string;
  "calendar.defaultRoomSlug": string;
  "calendar.sidebar.calendars": string;
  "calendar.sidebar.loading": string;
  "calendar.sidebar.noCalendars": string;
  "calendar.sidebar.shared": string;
  "calendar.sidebar.browserTz": string;
  "calendar.sidebar.open": string;
  "calendar.sidebar.close": string;
  "calendar.aria.back": string;
  "calendar.aria.forward": string;
  "calendar.aria.refresh": string;
  "calendar.view.label": string;
  "calendar.view.schedulingTooltip": string;
  "calendar.view.scheduling": string;
  "calendar.moreInMonth": string;
  "calendar.allDayAbbrev": string;
  "calendar.delete.confirm": string;
  "calendar.delete.failed": string;
  "calendar.save.failed": string;
  "calendar.rsvp.failed": string;
  "calendar.skipOccurrence.confirm": string;
  "calendar.drawer.close": string;
  "calendar.series.short": string;
  "calendar.section.when": string;
  "calendar.section.yourResponse": string;
  "calendar.section.videoCall": string;
  "calendar.section.attendees": string;
  "calendar.section.reminders": string;
  "calendar.section.recurrence": string;
  "calendar.section.description": string;
  "calendar.section.where": string;
  "calendar.remoteTimesForYou": string;
  "calendar.recurrence.untilPrefix": string;
  "calendar.recurrence.countSuffix": string;
  "calendar.skipSeriesOccurrence": string;
  "calendar.delete.action": string;
  "calendar.partstat.accepted": string;
  "calendar.partstat.declined": string;
  "calendar.partstat.tentative": string;
  "calendar.partstat.needsAction": string;
  "calendar.partstat.delegated": string;
  "calendar.partstat.unknown": string;
  "calendar.reminder.before5": string;
  "calendar.reminder.before15": string;
  "calendar.reminder.before30": string;
  "calendar.reminder.before60": string;
  "calendar.reminder.before1d": string;
  "calendar.reminder.channelEmail": string;
  "calendar.reminder.channelPopup": string;
  "calendar.reminder.line": string;
  "calendar.recurrence.none": string;
  "calendar.recurrence.daily": string;
  "calendar.recurrence.weekly": string;
  "calendar.recurrence.biweekly": string;
  "calendar.recurrence.monthly": string;
  "calendar.recurrence.yearly": string;
  "calendar.recurrence.custom": string;
  "calendar.recurrence.customPattern": string;
  "calendar.compose.newTitle": string;
  "calendar.compose.titlePlaceholder": string;
  "calendar.field.calendar": string;
  "calendar.field.date": string;
  "calendar.field.start": string;
  "calendar.field.end": string;
  "calendar.timesInTimezone": string;
  "calendar.field.locationPlaceholder": string;
  "calendar.field.recurrence": string;
  "calendar.field.endsOn": string;
  "calendar.field.afterNOccurrences": string;
  "calendar.optional": string;
  "calendar.reminders.heading": string;
  "calendar.reminders.none": string;
  "calendar.attendees.label": string;
  "calendar.attendees.placeholder": string;
  "calendar.attendees.hint": string;
  "calendar.description.placeholder": string;
  "calendar.compose.save": string;
  "calendar.video.toggleRemove": string;
  "calendar.video.toggleAdd": string;
  "calendar.video.testRoom": string;
  "calendar.video.helpWhenOn": string;
  "calendar.video.helpWhenOff": string;
  "calendar.video.copyLink": string;
  "calendar.sched.title": string;
  "calendar.sched.intro": string;
  "calendar.sched.participantsPlaceholder": string;
  "calendar.sched.duration": string;
  "calendar.sched.from": string;
  "calendar.sched.to": string;
  "calendar.sched.workStartTitle": string;
  "calendar.sched.workEndTitle": string;
  "calendar.sched.weekendsTitle": string;
  "calendar.sched.weekendsShort": string;
  "calendar.sched.suggestions": string;
  "calendar.sched.more": string;
  "calendar.sched.moreTitle": string;
  "calendar.sched.slotTitle": string;
  "calendar.sched.noSlot": string;
  "calendar.sched.weekendIncluded": string;
  "calendar.sched.personColumn": string;
  "calendar.sched.youFallback": string;
  "calendar.sched.minutesShort": string;
  "calendar.sched.selfLive": string;
  "calendar.sched.emptyLanes": string;
  "calendar.rsvp.accept": string;
  "calendar.rsvp.tentative": string;
  "calendar.rsvp.decline": string;
  "calendar.rsvp.current": string;

  // ─── Theme ──────────────────────────────────────────────────────────
  "theme.light": string;
  "theme.dark": string;
  "theme.system": string;

  // ─── Mail ───────────────────────────────────────────────────────────
  "mail.folder.inbox": string;
  "mail.folder.sent": string;
  "mail.folder.drafts": string;
  "mail.folder.spam": string;
  "mail.folder.trash": string;
  "mail.folder.archive": string;
  "mail.compose": string;
  "mail.compose.to": string;
  "mail.compose.cc": string;
  "mail.compose.bcc": string;
  "mail.compose.subject": string;
  "mail.compose.body": string;
  "mail.compose.send": string;
  "mail.compose.saveDraft": string;
  "mail.empty.list": string;
  "mail.empty.noSelection": string;
  "mail.markRead": string;
  "mail.markUnread": string;
  "mail.delete": string;
  "mail.moveTo": string;
  "mail.settings": string;
  "mail.bulk.one": string;
  "mail.bulk.many": string;
  "mail.bulk.visible": string;
  "mail.bulk.selectAllVisible": string;
  "mail.bulk.clearSelection": string;
  "mail.bulk.moveToTrash": string;
  "mail.bulk.deleteConfirm": string;
  "mail.bulk.partialFail": string;
  "mail.reloadFolders": string;
  "mail.resize.folderRail": string;
  "mail.resize.messageList": string;
  "mail.mobile.backToList": string;
  "mail.folder.aria": string;
  "mail.aiTriage.tooltip": string;
  "mail.aiTriage.button": string;
  "mail.loading.threadList": string;
  "mail.loading.message": string;
  "mail.empty.threadSearch": string;
  "mail.empty.threadList": string;
  "mail.select.messageHint": string;
  "mail.row.selectAria": string;
  "mail.row.threadBadgeTitle": string;
  "mail.triage.urgent": string;
  "mail.triage.needsAction": string;
  "mail.triage.fyi": string;
  "mail.triage.noise": string;
  "mail.reader.backToList": string;
  "mail.reader.to": string;
  "mail.reader.cc": string;
  "mail.reader.aiReply": string;
  "mail.reader.asIssue": string;
  "mail.reader.snooze": string;
  "mail.reader.moreInThread": string;
  "mail.noSubject": string;
  "mail.noBody": string;
  "mail.unknownSender": string;
  "mail.sendFailed": string;
  "mail.quote.header": string;
  "mail.compose.attachment": string;
  "mail.compose.aiWithAi": string;
  "mail.compose.aiDraftTooltip": string;
  "mail.compose.aiDraftIntro": string;
  "mail.compose.aiDraftPlaceholder": string;
  "mail.compose.toneLabel": string;
  "mail.compose.tone.friendly": string;
  "mail.compose.tone.formal": string;
  "mail.compose.tone.short": string;
  "mail.compose.aiDraftButton": string;
  "mail.compose.recipientsPlaceholder": string;
  "mail.compose.aiDraftFailed": string;
  "mail.compose.bodyPlaceholder": string;
  "mail.snooze.title": string;
  "mail.snooze.intro": string;
  "mail.snooze.customTime": string;
  "mail.snooze.submit": string;
  "mail.snooze.errorMinFuture": string;
  "mail.snooze.errorInvalidDate": string;
  "mail.snooze.preset.inOneHour": string;
  "mail.snooze.preset.todayEvening": string;
  "mail.snooze.preset.tomorrowEvening": string;
  "mail.snooze.preset.tomorrowMorning": string;
  "mail.snooze.preset.nextMonday": string;
  "mail.issue.dialogTitle": string;
  "mail.issue.successBody": string;
  "mail.issue.openIssueLink": string;
  "mail.issue.projectLabel": string;
  "mail.issue.loadingProjects": string;
  "mail.issue.noProjects": string;
  "mail.issue.titleLabel": string;
  "mail.issue.priorityLabel": string;
  "mail.issue.descIntro": string;
  "mail.issue.descBullet1": string;
  "mail.issue.descBullet2": string;
  "mail.issue.descBullet3": string;
  "mail.issue.createButton": string;
  "mail.issue.html.fromMail": string;
  "mail.issue.html.date": string;
  "mail.issue.html.subject": string;
  "mail.issue.html.openOriginal": string;
  "mail.aiReply.title": string;
  "mail.aiReply.knowledgeTooltip": string;
  "mail.aiReply.knowledgeCountOne": string;
  "mail.aiReply.knowledgeCountMany": string;
  "mail.aiReply.intentPlaceholder": string;
  "mail.aiReply.tone.empathic": string;
  "mail.aiReply.generate": string;
  "mail.aiReply.regenerate": string;
  "mail.aiReply.notConfiguredIntro": string;
  "mail.aiReply.knowledgeBase": string;
  "mail.aiReply.notConfiguredOutro": string;
  "mail.aiReply.generating": string;
  "mail.aiReply.apply": string;
  "mail.aiReply.subjectLabel": string;

  // ─── CRM ────────────────────────────────────────────────────────────
  "crm.companies": string;
  "crm.people": string;
  "crm.deals": string;
  "crm.notes": string;
  "crm.tab.activity": string;
  "crm.tab.people": string;
  "crm.tab.deals": string;
  "crm.tab.details": string;
  "crm.empty.companies": string;
  "crm.empty.people": string;
  "crm.empty.activity": string;
  "crm.empty.selection": string;
  "crm.placeholder.companyName": string;
  "crm.placeholder.search": string;
  "crm.scraper": string;
  "crm.settings": string;
  "crm.toolbar.pipelineAll": string;
  "crm.toolbar.importCsv": string;
  "crm.toolbar.newCompany": string;
  "crm.button.company": string;
  "crm.empty.filtered": string;
  "crm.empty.noCompanySelected": string;
  "crm.hub.linksTitle": string;
  "crm.hub.linksSubtitleWithCompany": string;
  "crm.hub.linksSubtitleEmpty": string;
  "crm.twenty.nativeTitle": string;
  "crm.twenty.createSoonTooltip": string;
  "crm.bulk.deleteConfirmOne": string;
  "crm.bulk.deleteConfirmMany": string;
  "crm.alert.saveFailed": string;
  "crm.alert.deleteFailed": string;
  "crm.savedView.promptName": string;
  "crm.time.justNow": string;
  "crm.time.minutesShort": string;
  "crm.time.hoursShort": string;
  "crm.time.daysShort": string;
  "crm.mautic.noSegments": string;
  "crm.person.noEmail": string;
  "crm.activity.empty": string;
  "crm.feed.noTitle": string;
  "crm.feed.noName": string;
  "crm.deals.noOpen": string;
  "crm.stats.lastActivity": string;
  "crm.mautic.syncPeopleTitle": string;
  "crm.delete.confirmNamed": string;
  "crm.bulk.deletePartialFail": string;
  "crm.alert.createFailed": string;
  "crm.alert.pushFailed": string;
  "crm.savedView.deleteConfirm": string;
  "crm.loadMore": string;
  "crm.twenty.hint": string;
  "crm.stats.noActivityShort": string;
  "crm.savedView.applyTitle": string;
  "crm.filter.reset": string;
  "crm.openInTwenty": string;
  "crm.tooltip.closeFilter": string;
  "crm.tooltip.deleteView": string;
  "crm.selection.clear": string;
  "crm.selection.selectAllVisible": string;
  "crm.selection.count": string;
  "crm.bulk.setLeadSource": string;
  "crm.bulk.setOwner": string;
  "crm.bulk.deleteSelection": string;
  "crm.button.delete": string;
  "crm.push.skippedNoEmail": string;
  "crm.modal.close": string;
  "crm.segment.pickTitle": string;
  "crm.segment.select": string;
  "crm.segment.clickOutsideHint": string;
  "crm.selection.removeRow": string;
  "crm.selection.addRow": string;
  "crm.saveChanges": string;
  "crm.hub.crossAppTitle": string;
  "crm.section.keyContacts": string;
  "crm.changedAt": string;
  "crm.sync.summary": string;
  "crm.sync.errorsSuffix": string;
  "crm.openInMautic": string;
  "crm.claude.heading": string;
  "crm.channel.pickAgain": string;
  "crm.label.add": string;
  "crm.calls.linkedTitle": string;
  "crm.notes.placeholder": string;
  "crm.modal.closeShort": string;
  "crm.scraper.runningSince": string;
  "crm.scraper.triggerIntro": string;
  "crm.scraper.fullPanelTitle": string;
  "crm.scraper.running": string;
  "crm.scraper.runningShort": string;
  "crm.scraper.startingButton": string;
  "crm.scraper.triggerRun": string;
  "crm.scraper.lastRunOkPrefix": string;
  "crm.scraper.lastRunExitPrefix": string;
  "crm.scraper.advancedShort": string;
  "crm.scraper.errorBadge": string;
  "crm.scraper.offlineBadge": string;
  "crm.scraper.okBadge": string;
  "crm.scraper.dryRunCheckbox": string;
  "crm.scraper.cantonOptionalLabel": string;
  "crm.scraper.cantonPlaceholder": string;
  "crm.scraper.limitLabel": string;
  "crm.savedViews.heading": string;
  "crm.savedView.saveAsNewTitle": string;
  "crm.filter.phone": string;
  "crm.filter.emailField": string;
  "crm.filter.owner": string;
  "crm.filter.booking": string;
  "crm.filter.leadSourceFacet": string;
  "crm.filter.cityFacet": string;
  "crm.triState.any": string;
  "crm.triState.yes": string;
  "crm.triState.no": string;
  "crm.facet.less": string;
  "crm.facet.more": string;
  "crm.selection.visibleTotal": string;
  "crm.push.titleUpsertNoSegment": string;
  "crm.push.buttonInFunnel": string;
  "crm.segment.loading": string;
  "crm.push.resultPushed": string;
  "crm.push.resultToSegment": string;
  "crm.push.resultErrors": string;
  "crm.bulk.placeholderLeadSource": string;
  "crm.bulk.placeholderOwner": string;
  "crm.bulk.leadSourceShort": string;
  "crm.bulk.ownerShort": string;
  "crm.leadScore.title": string;
  "crm.leadScore.desc.hot": string;
  "crm.leadScore.desc.warm": string;
  "crm.leadScore.desc.cold": string;
  "crm.activityTone.fresh": string;
  "crm.activityTone.warm": string;
  "crm.activityTone.stale": string;
  "crm.person.placeholder.name": string;
  "crm.person.placeholder.phone": string;
  "crm.person.placeholder.emailGeneral": string;
  "crm.company.unnamed": string;
  "crm.nav.backToCrm": string;
  "crm.companyHub.tagline": string;
  "crm.companyHub.phoneShort": string;
  "crm.companyHub.quickLinksHeading": string;
  "crm.companyHub.tileCrmTitle": string;
  "crm.companyHub.tileCrmDesc": string;
  "crm.companyHub.tileMailDescCompose": string;
  "crm.companyHub.tileMailDescDomain": string;
  "crm.companyHub.tileMailDescInbox": string;
  "crm.companyHub.tileHelpdeskDesc": string;
  "crm.companyHub.tileFilesDescSearch": string;
  "crm.companyHub.tileFilesDescManual": string;
  "crm.companyHub.tileOfficeDesc": string;
  "crm.companyHub.tileSignTitle": string;
  "crm.companyHub.tileSignDesc": string;
  "crm.companyHub.tileTwentyTitle": string;
  "crm.companyHub.tileTwentyDesc": string;
  "crm.pipeline.title": string;
  "crm.pipeline.subtitle": string;
  "crm.pipeline.searchPlaceholder": string;
  "crm.pipeline.loading": string;
  "crm.opportunity.alertDropUnset": string;
  "crm.opportunity.dragToChangeStage": string;
  "crm.opportunity.openInFullCrm": string;
  "crm.opportunity.dropHere": string;
  "crm.opportunity.stageUnset": string;
  "crm.opportunity.emptyBoard": string;
  "crm.attribution.heading": string;
  "crm.attribution.subheading": string;
  "crm.attribution.loading": string;
  "crm.attribution.empty": string;
  "crm.attribution.firstTouch": string;
  "crm.attribution.lastTouch": string;
  "crm.settingsPage.title": string;
  "crm.settingsPage.subtitle": string;
  "crm.settingsPage.intro": string;
  "crm.settingsPage.loadFailed": string;
  "crm.settingsPage.sectionApi": string;
  "crm.settingsPage.linkApiKeysTwenty": string;
  "crm.settingsPage.apiReachable": string;
  "crm.settingsPage.apiUnreachable": string;
  "crm.settingsPage.labelTwentyWorkspaceId": string;
  "crm.settingsPage.labelPublicUrl": string;
  "crm.settingsPage.labelComposeUrl": string;
  "crm.settingsPage.kpiPipelineStages": string;
  "crm.settingsPage.sectionMembers": string;
  "crm.settingsPage.linkEditInTwenty": string;
  "crm.settingsPage.membersEmpty": string;
  "crm.settingsPage.sectionPipeline": string;
  "crm.settingsPage.linkDataModel": string;
  "crm.settingsPage.pipelineIntroPrefix": string;
  "crm.settingsPage.pipelineIntroSuffix": string;
  "crm.settingsPage.pipelineEmpty": string;
  "crm.settingsPage.sectionLeadSources": string;
  "crm.settingsPage.leadSourcesEmpty": string;
  "crm.settingsPage.sectionIntegrations": string;
  "crm.settingsPage.integrationMauticTitle": string;
  "crm.settingsPage.integrationMauticSubtitle": string;
  "crm.settingsPage.integrationTwentyTitle": string;
  "crm.settingsPage.integrationTwentySubtitle": string;
  "crm.importCsvModal.title": string;
  "crm.importCsvModal.subtitleCompanies": string;
  "crm.importCsvModal.subtitlePeople": string;
  "crm.importCsvModal.entityPeople": string;
  "crm.importCsvModal.entityCompanies": string;
  "crm.importCsvModal.formatHint": string;
  "crm.importCsvModal.uploadCsv": string;
  "crm.importCsvModal.previewBusy": string;
  "crm.importCsvModal.totalsRows": string;
  "crm.importCsvModal.totalsValid": string;
  "crm.importCsvModal.totalsSkipped": string;
  "crm.importCsvModal.sepComma": string;
  "crm.importCsvModal.sepSemicolon": string;
  "crm.importCsvModal.sepTab": string;
  "crm.importCsvModal.autoCreateCompanies": string;
  "crm.importCsvModal.mappingHeading": string;
  "crm.importCsvModal.columnEmpty": string;
  "crm.importCsvModal.thNum": string;
  "crm.importCsvModal.thCompanyName": string;
  "crm.importCsvModal.thDomain": string;
  "crm.importCsvModal.thCity": string;
  "crm.importCsvModal.thIndustry": string;
  "crm.importCsvModal.thPersonName": string;
  "crm.importCsvModal.thEmail": string;
  "crm.importCsvModal.thCompany": string;
  "crm.importCsvModal.thJobTitle": string;
  "crm.importCsvModal.thStatus": string;
  "crm.importCsvModal.resultCompaniesSuffix": string;
  "crm.importCsvModal.resultPeopleSuffix": string;
  "crm.importCsvModal.skippedSummary": string;
  "crm.importCsvModal.errorsSummary": string;
  "crm.importCsvModal.errorsRowPrefix": string;
  "crm.importCsvModal.footerReady": string;
  "crm.importCsvModal.footerPrompt": string;
  "crm.importCsvModal.runCount": string;
  "crm.importCsvModal.running": string;
  "crm.importCsvModal.delimiterDetected": string;
  "crm.importCsvModal.field.ignore": string;
  "crm.importCsvModal.field.companyName": string;
  "crm.importCsvModal.field.domainName": string;
  "crm.importCsvModal.field.industry": string;
  "crm.importCsvModal.field.phone": string;
  "crm.importCsvModal.field.address": string;
  "crm.importCsvModal.field.city": string;
  "crm.importCsvModal.field.country": string;
  "crm.importCsvModal.field.arr": string;
  "crm.importCsvModal.field.employees": string;
  "crm.importCsvModal.field.linkedinUrl": string;
  "crm.importCsvModal.field.xUrl": string;
  "crm.importCsvModal.field.notes": string;
  "crm.importCsvModal.field.firstName": string;
  "crm.importCsvModal.field.lastName": string;
  "crm.importCsvModal.field.fullName": string;
  "crm.importCsvModal.field.email": string;
  "crm.importCsvModal.field.jobTitle": string;
  "crm.importCsvModal.field.company": string;
  "crm.mautic.badgeDetailed": string;
  "crm.mautic.badgeSimpleOne": string;
  "crm.mautic.badgeSimpleMany": string;
  "crm.quick.call": string;
  "crm.quick.videoCall": string;
  "crm.quick.mail": string;
  "crm.quick.note": string;
  "crm.quick.task": string;
  "crm.quick.companyHub": string;
  "crm.quick.mailToPortal": string;
  "crm.call.subjectWithCompany": string;
  "crm.quick.callNumber": string;
  "crm.quick.mailTo": string;
  "crm.icp.label": string;
  "crm.section.contact": string;
  "crm.section.classification": string;
  "crm.section.timeline": string;
  "crm.people.leadTherapistSection": string;
  "crm.people.therapistsColumn": string;
  "crm.people.keyStaffTitle": string;
  "crm.notes.titlePlaceholder": string;
  "crm.ai.classifyFailedHeading": string;
  "crm.timeline.created": string;
  "crm.timeline.updated": string;
  "crm.field.ownerMail": string;
  "crm.field.icp": string;
  "crm.field.tenant": string;
  "crm.marketing.loadingData": string;
  "crm.marketing.apiNotConfigured": string;
  "crm.marketing.credentialsMissing": string;
  "crm.marketing.contactsLine": string;
  "crm.marketing.segmentTooltip": string;
  "crm.marketing.pointsAbbrev": string;
  "crm.sidebar.marketing": string;
  "crm.ai.leadButton": string;
  "crm.ai.classifyTooltip": string;
  "crm.ai.nextStepLabel": string;
  "crm.ai.salesBriefTooltip": string;
  "crm.ai.salesBriefModalHeading": string;
  "crm.ai.salesBriefButton": string;
  "crm.ai.briefFailedHeading": string;
  "crm.ai.websiteOkBadge": string;
  "crm.ai.knowledgeBadge": string;
  "crm.ai.copyToClipboard": string;
  "crm.ai.copied": string;
  "crm.ai.regenerate": string;
  "crm.ai.pitchTooltip": string;
  "crm.ai.pitchButton": string;
  "crm.ai.channelLabel": string;
  "crm.ai.pitchEmptyHint": string;
  "crm.pitch.cold_email": string;
  "crm.pitch.linkedin": string;
  "crm.pitch.followup": string;
  "crm.pitch.call_opener": string;
  "crm.scraper.launcherHeading": string;
  "crm.stat.openDeals": string;
  "crm.stat.contacts": string;
  "crm.stat.lastContact": string;
  "crm.stat.openTasks": string;
  "crm.stat.tasksFromTotal": string;
  "crm.stat.tasksAllDone": string;
  "crm.inlineEdit.saveTooltip": string;
  "crm.inlineEdit.editFieldsTooltip": string;
  "crm.section.activeDeals": string;
  "crm.details.practiceSection": string;
  "crm.details.addressSection": string;
  "crm.field.specialization": string;
  "crm.field.languages": string;
  "crm.field.street": string;
  "crm.field.zipCity": string;
  "crm.field.country": string;
  "crm.field.leadName": string;

  // ─── Helpdesk ───────────────────────────────────────────────────────
  "helpdesk.tickets": string;
  "helpdesk.scope.all": string;
  "helpdesk.scope.mine": string;
  "helpdesk.scope.unassigned": string;
  "helpdesk.filter.open": string;
  "helpdesk.filter.closed": string;
  "helpdesk.filter.all": string;
  "helpdesk.status.new": string;
  "helpdesk.status.open": string;
  "helpdesk.status.pending": string;
  "helpdesk.status.closed": string;
  "helpdesk.status.merged": string;
  "helpdesk.priority.low": string;
  "helpdesk.priority.normal": string;
  "helpdesk.priority.high": string;
  "helpdesk.priority.urgent": string;
  "helpdesk.empty.mine": string;
  "helpdesk.empty.allAssigned": string;
  "helpdesk.empty.open": string;
  "helpdesk.empty.generic": string;
  "helpdesk.newTicket": string;
  "helpdesk.reply": string;
  "helpdesk.internalNote": string;
  "helpdesk.assignee": string;
  "helpdesk.group": string;
  "helpdesk.settings": string;
  "helpdesk.slaRisk": string;
  "helpdesk.slaRisk.title": string;
  "helpdesk.stats.open": string;
  "helpdesk.stats.slaAtRisk": string;
  "helpdesk.stats.closedToday": string;
  "helpdesk.stats.capped": string;
  "helpdesk.composer.answerTab": string;
  "helpdesk.composer.internalTab": string;
  "helpdesk.composer.sendShortcut": string;
  "helpdesk.composer.solutionLabel": string;
  "helpdesk.composer.solutionPlaceholder": string;
  "helpdesk.composer.placeholderReply": string;
  "helpdesk.composer.placeholderNote": string;
  "helpdesk.composer.statusAfterSend": string;
  "helpdesk.composer.saveNote": string;
  "helpdesk.customer.crm": string;
  "helpdesk.customer.crmTitle": string;
  "helpdesk.channel.email": string;
  "helpdesk.channel.phone": string;
  "helpdesk.channel.web": string;
  "helpdesk.channel.note": string;
  "helpdesk.channel.sms": string;
  "helpdesk.channel.chat": string;
  "helpdesk.channel.twitter": string;
  "helpdesk.channel.facebook": string;
  "helpdesk.channel.other": string;
  "helpdesk.import.csvTitle": string;
  "helpdesk.conversation.title": string;
  "helpdesk.conversation.pickTicket": string;
  "helpdesk.portalLink.mintTitle": string;
  "helpdesk.portalLink.button": string;
  "helpdesk.portalLink.copied": string;
  "helpdesk.portalLink.copiedToast": string;
  "helpdesk.portalLink.prompt": string;
  "helpdesk.portalLink.manualCopied": string;
  "helpdesk.empty.noTicket": string;
  "helpdesk.empty.noTicketHint": string;
  "helpdesk.empty.noMessages": string;
  "helpdesk.empty.zammadTitle": string;
  "helpdesk.empty.zammadHint": string;
  "helpdesk.error.loadTicket": string;
  "helpdesk.error.createTicket": string;
  "helpdesk.error.save": string;
  "helpdesk.error.send": string;
  "helpdesk.error.tagAdd": string;
  "helpdesk.error.tagRemove": string;
  "helpdesk.error.portalLink": string;
  "helpdesk.error.macro": string;
  "helpdesk.error.bulk": string;
  "helpdesk.bulk.partialFail": string;
  "helpdesk.card.mine": string;
  "helpdesk.card.selectBulk": string;
  "helpdesk.card.noTitle": string;
  "helpdesk.card.unread": string;
  "helpdesk.crm.twentyLabel": string;
  "helpdesk.newTicket.subjectPh": string;
  "helpdesk.newTicket.bodyPh": string;
  "helpdesk.newTicket.cancel": string;
  "helpdesk.newTicket.submit": string;
  "helpdesk.composer.templates": string;
  "helpdesk.composer.templatesTitle": string;
  "helpdesk.composer.attachmentSoon": string;
  "helpdesk.composer.attachment": string;
  "helpdesk.customer.videoCall": string;
  "helpdesk.customer.mailAction": string;
  "helpdesk.customer.profile360": string;
  "helpdesk.customer.profileTitle": string;
  "helpdesk.customer.unknown": string;
  "helpdesk.article.agent": string;
  "helpdesk.sla.firstResponse": string;
  "helpdesk.sla.closeDeadline": string;
  "helpdesk.sla.breached": string;
  "helpdesk.sla.pill": string;
  "helpdesk.sla.due": string;
  "helpdesk.sla.panel.first": string;
  "helpdesk.sla.panel.close": string;
  "helpdesk.sla.panel.none": string;
  "helpdesk.time.justNow": string;
  "helpdesk.time.mins": string;
  "helpdesk.time.hours": string;
  "helpdesk.time.days": string;
  "helpdesk.drawer.ticketsTotal": string;
  "helpdesk.drawer.customerSince": string;
  "helpdesk.drawer.history": string;
  "helpdesk.drawer.noTickets": string;
  "helpdesk.drawer.writeEmail": string;
  "helpdesk.drawer.title": string;
  "helpdesk.drawer.close": string;
  "helpdesk.conversation.articlesCount": string;
  "helpdesk.sidebar.statusAssignment": string;
  "helpdesk.detail.customerInternalNoteHeading": string;
  "helpdesk.detail.historyTickets": string;
  "helpdesk.detail.createdAt": string;
  "helpdesk.detail.updatedAt": string;
  "helpdesk.detail.lastContactAt": string;
  "helpdesk.header.shortcutsTooltip": string;
  "helpdesk.header.shortcutsLabel": string;
  "helpdesk.openInZammad": string;
  "helpdesk.ai.tooltipWithKb": string;
  "helpdesk.ai.tooltipReplyOnly": string;
  "helpdesk.ai.replyToggle": string;
  "helpdesk.ai.closeAria": string;
  "helpdesk.bulk.selectedCount": string;
  "helpdesk.bulk.selectAllVisible": string;
  "helpdesk.bulk.clearSelection": string;
  "helpdesk.bulk.optionStatus": string;
  "helpdesk.bulk.optionPriority": string;
  "helpdesk.bulk.optionGroup": string;
  "helpdesk.bulk.optionAssignee": string;
  "helpdesk.bulk.unassign": string;
  "helpdesk.bulk.apply": string;
  "helpdesk.field.assignee": string;
  "helpdesk.macro.menuTitle": string;
  "helpdesk.macro.setsPrefix": string;
  "helpdesk.filter.viewsLabel": string;
  "helpdesk.filter.zammadViewTitle": string;
  "helpdesk.filter.moreCount": string;
  "helpdesk.filter.less": string;
  "helpdesk.tags.add": string;
  "helpdesk.tags.remove": string;
  "helpdesk.composer.solutionHtmlHeading": string;
  "helpdesk.canned.title": string;
  "helpdesk.canned.browserOnly": string;
  "helpdesk.canned.new": string;
  "helpdesk.canned.none": string;
  "helpdesk.canned.namePlaceholder": string;
  "helpdesk.canned.bodyPlaceholder": string;
  "helpdesk.canned.placeholderHint": string;
  "helpdesk.canned.pickPrompt": string;
  "helpdesk.shortcuts.title": string;
  "helpdesk.shortcuts.focusSearch": string;
  "helpdesk.shortcuts.nextPrev": string;
  "helpdesk.shortcuts.newTicket": string;
  "helpdesk.shortcuts.replyComposer": string;
  "helpdesk.shortcuts.assignMe": string;
  "helpdesk.shortcuts.bulkMark": string;
  "helpdesk.shortcuts.toggleOverlay": string;
  "helpdesk.shortcuts.closeOverlay": string;
  "helpdesk.shortcuts.sendReply": string;

  "helpdesk.settings.backTitle": string;
  "helpdesk.settings.title": string;
  "helpdesk.settings.subtitle": string;
  "helpdesk.settings.loadError": string;
  "helpdesk.settings.introBefore": string;
  "helpdesk.settings.introAfter": string;
  "helpdesk.settings.groupsTitle": string;
  "helpdesk.settings.groupsEmptyBefore": string;
  "helpdesk.settings.groupsEmptyAfter": string;
  "helpdesk.settings.emailsTitle": string;
  "helpdesk.settings.emailsAdd": string;
  "helpdesk.settings.emailsEmpty": string;
  "helpdesk.settings.channelsTitle": string;
  "helpdesk.settings.channelsAdd": string;
  "helpdesk.settings.channelsNeedGroup": string;
  "helpdesk.settings.channelsNewHint": string;
  "helpdesk.settings.channelsEmpty": string;
  "helpdesk.settings.tenantTitle": string;
  "helpdesk.settings.tenantWorkspace": string;
  "helpdesk.settings.tenantGroups": string;
  "helpdesk.settings.tenantEnvHint": string;
  "helpdesk.settings.tenantEnvSuffix": string;
  "helpdesk.settings.channelDeleteConfirm": string;
  "helpdesk.settings.emailDeleteConfirm": string;
  "helpdesk.settings.channelId": string;
  "helpdesk.settings.active": string;
  "helpdesk.settings.inactive": string;
  "helpdesk.settings.edit": string;
  "helpdesk.settings.activate": string;
  "helpdesk.settings.deactivate": string;
  "helpdesk.settings.pause": string;
  "helpdesk.settings.delete": string;
  "helpdesk.settings.inboundShort": string;
  "helpdesk.settings.outboundShort": string;
  "helpdesk.settings.notConfigured": string;
  "helpdesk.settings.noFields": string;
  "helpdesk.settings.protocol": string;
  "helpdesk.settings.encryption": string;
  "helpdesk.settings.ssl993": string;
  "helpdesk.settings.starttls143": string;
  "helpdesk.settings.encryptionNone": string;
  "helpdesk.settings.host": string;
  "helpdesk.settings.port": string;
  "helpdesk.settings.user": string;
  "helpdesk.settings.password": string;
  "helpdesk.settings.folder": string;
  "helpdesk.settings.behavior": string;
  "helpdesk.settings.keepOnServer": string;
  "helpdesk.settings.outboundSection": string;
  "helpdesk.settings.smtpExternal": string;
  "helpdesk.settings.sendmailLocal": string;
  "helpdesk.settings.starttls587": string;
  "helpdesk.settings.ssl465": string;
  "helpdesk.settings.inboundSection": string;
  "helpdesk.settings.senderBlock": string;
  "helpdesk.settings.displayName": string;
  "helpdesk.settings.memberCountOne": string;
  "helpdesk.settings.memberCountMany": string;
  "helpdesk.settings.defaultSender": string;
  "helpdesk.settings.groupDefaultMailbox": string;
  "helpdesk.settings.noteLabel": string;
  "helpdesk.settings.noneOption": string;
  "helpdesk.settings.status": string;
  "helpdesk.settings.groupActiveLabel": string;
  "helpdesk.settings.noteField": string;
  "helpdesk.settings.notePlaceholder": string;
  "helpdesk.settings.members": string;
  "helpdesk.settings.loadMembers": string;
  "helpdesk.settings.noAgents": string;
  "helpdesk.settings.pickAgent": string;
  "helpdesk.settings.addMember": string;
  "helpdesk.settings.removeFromGroup": string;
  "helpdesk.settings.emailDisplayNameShort": string;
  "helpdesk.settings.otherWorkspace": string;
  "helpdesk.settings.emailDisplayNameFull": string;
  "helpdesk.settings.placeholderSupportName": string;
  "helpdesk.settings.emailActiveLabel": string;
  "helpdesk.settings.emailAddTitle": string;
  "helpdesk.settings.emailAddSubtitle": string;
  "helpdesk.settings.create": string;
  "helpdesk.settings.emailField": string;
  "helpdesk.settings.channelBinding": string;
  "helpdesk.settings.channelBindingNone": string;
  "helpdesk.settings.channelPick": string;
  "helpdesk.settings.channelBindingHint": string;
  "helpdesk.settings.placeholderEmail": string;
  "helpdesk.settings.channelModalTitle": string;
  "helpdesk.settings.channelModalSubtitle": string;
  "helpdesk.settings.testConnection": string;
  "helpdesk.settings.noGroupsOption": string;
  "helpdesk.settings.groupSelectLabel": string;
  "helpdesk.settings.overridePasswords": string;
  "helpdesk.settings.testShort": string;
  "helpdesk.settings.name": string;
  "helpdesk.settings.inboundLabel": string;
  "helpdesk.settings.outboundLabel": string;
  "helpdesk.settings.refreshTitle": string;
  "helpdesk.settings.inboundColon": string;
  "helpdesk.settings.outboundColon": string;
  "helpdesk.settings.testOk": string;

  "office.word.group.history": string;
  "office.word.undo": string;
  "office.word.redo": string;
  "office.word.group.style": string;
  "office.word.styleAria": string;
  "office.word.paragraph": string;
  "office.word.h1": string;
  "office.word.h2": string;
  "office.word.h3": string;
  "office.word.h4": string;
  "office.word.group.start": string;
  "office.word.bold": string;
  "office.word.italic": string;
  "office.word.underline": string;
  "office.word.strike": string;
  "office.word.highlight": string;
  "office.word.inlineCode": string;
  "office.word.clearFormat": string;
  "office.word.group.lists": string;
  "office.word.bulletList": string;
  "office.word.orderedList": string;
  "office.word.taskList": string;
  "office.word.quote": string;
  "office.word.group.align": string;
  "office.word.alignLeft": string;
  "office.word.alignCenter": string;
  "office.word.alignRight": string;
  "office.word.alignJustify": string;
  "office.word.group.insert": string;
  "office.word.insertLink": string;
  "office.word.promptUrl": string;
  "office.word.insertImage": string;
  "office.word.uploadFailed": string;
  "office.word.insertTable": string;
  "office.word.insertSigField": string;
  "office.word.promptSigLabel": string;
  "office.word.sigDefault": string;
  "office.word.group.font": string;
  "office.word.fontSize": string;
  "office.word.promptFontPt": string;
  "office.word.group.find": string;
  "office.word.findReplace": string;
  "office.word.group.merge": string;
  "office.word.mergeFromCrm": string;
  "office.word.wordsTitle": string;
  "office.word.wordsCount": string;
  "office.word.wordsCountOne": string;
  "office.word.mergePanelHint": string;
  "office.word.mergeSelectVisible": string;
  "office.word.mergeClose": string;
  "office.word.findNext": string;
  "office.word.findClose": string;

  "office.sheet.undo": string;
  "office.sheet.paste": string;
  "office.sheet.alignLeft": string;
  "office.sheet.alignRight": string;
  "office.sheet.currencyChf": string;
  "office.sheet.clearFormat": string;
  "office.sheet.insertGroup": string;
  "office.sheet.rowAbove": string;
  "office.sheet.rowBelow": string;
  "office.sheet.rowDelete": string;
  "office.sheet.colLeft": string;
  "office.sheet.colRight": string;
  "office.sheet.colDelete": string;
  "office.sheet.textLengthRule": string;
  "office.sheet.pickColTitle": string;
  "office.sheet.pickRowTitle": string;
  "office.sheet.filterActiveTitle": string;
  "office.sheet.adjustHeightTitle": string;
  "office.sheet.reset": string;
  "office.sheet.findNextTitle": string;
  "office.sheet.closeTitle": string;
  "office.sheet.tabsHelpTitle": string;
  "office.sheet.sheetDelete": string;
  "office.sheet.sheetCloseAria": string;
  "office.sheet.cfAddRule": string;
  "office.sheet.cfHeatMap": string;
  "office.sheet.cfHeatMapHint": string;
  "office.sheet.cfBlueOrangeHint": string;
  "office.sheet.cfPositiveGreen": string;
  "office.sheet.cfPositiveGreenHint": string;
  "office.sheet.paletteWhite": string;
  "office.sheet.paletteLightGreen": string;
  "office.sheet.paletteGreen": string;

  "cmdk.dialogAria": string;
  "cmdk.placeholder": string;
  "cmdk.closeEsc": string;
  "cmdk.noResults": string;
  "cmdk.tipsTitle": string;
  "cmdk.tipScopes": string;
  "cmdk.tipNavigate": string;
  "cmdk.tipShortcut": string;
  "cmdk.groupCompanies": string;
  "cmdk.groupPeople": string;
  "cmdk.groupDeals": string;
  "cmdk.groupSign": string;
  "cmdk.groupMarketing": string;
  "cmdk.groupFiles": string;
  "cmdk.groupPlane": string;
  "cmdk.enterOpen": string;
  "cmdk.groupHelpdesk": string;
  "cmdk.groupIntegration": string;
  "cmdk.escapeCloseLabel": string;
  "cmdk.footerGlobalSearch": string;

  "calls.preflight.title": string;
  "calls.preflight.hint.denied.step1Before": string;
  "calls.preflight.hint.denied.step1Icon": string;
  "calls.preflight.hint.denied.step1After": string;
  "calls.preflight.hint.denied.step2": string;
  "calls.preflight.hint.denied.step3": string;
  "calls.preflight.checkAgain": string;
  "calls.preflight.unsupported": string;
  "calls.preflight.denied": string;
  "calls.preflight.noDevice": string;
  "calls.preflight.inUse": string;
  "calls.preflight.insecure": string;
  "calls.preflight.unknown": string;
  "calls.jitsi.invalidUrl": string;
  "calls.jitsi.externalApiMissing": string;
  "calls.jitsi.openInTab": string;
  "calls.jitsi.grantTitle": string;
  "calls.jitsi.grantHint": string;
  "calls.jitsi.retry": string;
  "calls.jitsi.fallbackIframeWithMessage": string;
  "calls.jitsi.fallbackIframe": string;

  "admin.onboarding.scraper.pushConfirmCanton": string;
  "admin.onboarding.scraper.pushConfirmAll": string;
  "admin.onboarding.scraper.profilePlaceholder": string;
  "admin.onboarding.scraper.limitLabel": string;
  "admin.onboarding.scraper.skipDuplicates": string;
  "admin.onboarding.scraper.skipDuplicatesHint": string;
  "admin.onboarding.scraper.llmDisabled": string;
  "admin.onboarding.scraper.oneClickHint": string;
  "admin.onboarding.scraper.running": string;
  "admin.onboarding.scraper.preflightIncomplete": string;
  "admin.onboarding.scraper.trigger": string;
  "admin.onboarding.scraper.bannerIncomplete": string;
  "admin.onboarding.scraper.bannerRunning": string;
  "admin.onboarding.scraper.phaseProcess": string;
  "admin.onboarding.scraper.chooseProfileBanner": string;
  "admin.onboarding.scraper.reconnectBanner": string;
  "admin.onboarding.scraper.jobRunningBanner": string;
  "admin.onboarding.scraper.stallHint": string;
  "admin.onboarding.scraper.chooseProfileCta": string;
  "admin.onboarding.scraper.specialtiesHint": string;
  "admin.onboarding.scraper.cronPlaceholder": string;
  "admin.onboarding.scraper.cacheDryRunHint": string;
  "admin.onboarding.scraper.cacheEmptyCta": string;
  "admin.onboarding.scraper.pushFooter": string;
  "admin.onboarding.scraper.cacheEmptyDone": string;
  "admin.onboarding.scraper.pushAll": string;
  "admin.onboarding.scraper.preflightRunning": string;
  "admin.onboarding.scraper.retryCheck": string;
  "admin.onboarding.scraper.recheck": string;
  "admin.onboarding.scraper.triggerBlocked": string;
  "admin.onboarding.scraper.envHint": string;

  "admin.onboarding.leads.pickSegmentMerge": string;
  "admin.onboarding.leads.mergeFailed": string;
  "admin.onboarding.leads.pickSegmentCheck": string;
  "admin.onboarding.leads.optionChoose": string;
  "admin.onboarding.leads.mauticOffline": string;
  "admin.onboarding.leads.emptyNewHint": string;
  "admin.onboarding.leads.pickLead": string;
  "admin.onboarding.leads.noneToReview": string;
  "admin.onboarding.leads.mergePushesEmails": string;
  "admin.onboarding.leads.mergeToFunnel": string;
  "admin.onboarding.leads.confirmTitle": string;
  "admin.onboarding.leads.step3Confirm": string;
  "admin.onboarding.leads.checkRequired": string;
  "admin.onboarding.leads.forceContinueWarn": string;
  "admin.onboarding.leads.confirmMergeQuestion": string;
  "admin.onboarding.leads.undoHint": string;
  "admin.onboarding.leads.back": string;
  "admin.onboarding.leads.confirmBlockedTitle": string;
  "admin.onboarding.leads.confirmBlockedMissing": string;
  "admin.onboarding.leads.mergeNow": string;

  // ─── Sign ───────────────────────────────────────────────────────────
  "sign.documents": string;
  "sign.status.draft": string;
  "sign.status.pending": string;
  "sign.status.completed": string;
  "sign.status.rejected": string;
  "sign.scope.all": string;
  "sign.upload": string;
  "sign.send": string;
  "sign.empty.list": string;
  "sign.empty.selection": string;

  "sign.notConfiguredDefault": string;
  "sign.error.invalidResponse": string;
  "sign.actionFailed": string;
  "sign.visibilityChangeFailed": string;
  "sign.deleteConfirm": string;
  "sign.deleteFailed": string;
  "sign.upload.convertedNamed": string;
  "sign.upload.plainNamed": string;
  "sign.time.justNow": string;
  "sign.time.minsAgo": string;
  "sign.time.hoursAgo": string;
  "sign.time.daysAgo": string;
  "sign.salesFlow.title": string;
  "sign.salesFlow.step1Title": string;
  "sign.salesFlow.step1Body": string;
  "sign.salesFlow.step2Title": string;
  "sign.salesFlow.step2Body": string;
  "sign.salesFlow.step3Title": string;
  "sign.salesFlow.step3Body": string;
  "sign.crmLinkActive": string;
  "sign.companyHub": string;
  "sign.upload.teamCheckbox": string;
  "sign.upload.onlyMe": string;
  "sign.upload.formatsTitle": string;
  "sign.upload.uploading": string;
  "sign.upload.documentButton": string;
  "sign.manageInDocumenso": string;
  "sign.autoPdfFooter": string;
  "sign.search.placeholder": string;
  "sign.list.oneDoc": string;
  "sign.list.nDocs": string;
  "sign.notConfigured.title": string;
  "sign.notConfigured.provision": string;
  "sign.empty.noMatch": string;
  "sign.empty.noDocuments": string;
  "sign.empty.hintOtherSearch": string;
  "sign.empty.hintCreateDocumenso": string;
  "sign.empty.hintUploadSidebar": string;
  "sign.detail.emptyNativeTitle": string;
  "sign.detail.emptyNativeHint": string;
  "sign.detail.pickDocumentTitle": string;
  "sign.detail.pickDocumentHint": string;
  "sign.openInDocumenso": string;
  "sign.chunkSignWorkspace": string;
  "sign.row.privateListed": string;
  "sign.row.stalledHint": string;
  "sign.row.signedProgress": string;
  "sign.row.lastActivity": string;
  "sign.signingStatus.pending": string;
  "sign.signingStatus.signed": string;
  "sign.signingStatus.rejected": string;
  "sign.emailStatus.sent": string;
  "sign.emailStatus.notSent": string;
  "sign.sales.nextDraft": string;
  "sign.sales.nextPending": string;
  "sign.sales.nextCompleted": string;
  "sign.sales.nextRejected": string;
  "sign.detail.progressAllSigned": string;
  "sign.detail.signedProgressLine": string;
  "sign.detail.progressOneRejected": string;
  "sign.detail.progressDraft": string;
  "sign.detail.createdOn": string;
  "sign.detail.completedOn": string;
  "sign.detail.stalledText": string;
  "sign.detail.stalledLead": string;
  "sign.detail.smtpWarningTitle": string;
  "sign.detail.smtpWarningBody": string;
  "sign.detail.sequentialTitle": string;
  "sign.detail.sequentialBody": string;
  "sign.detail.preflightTitle": string;
  "sign.detail.preflightBody": string;
  "sign.detail.preflightMissingFor": string;
  "sign.detail.preflightEditorStrong": string;
  "sign.detail.preflightSendStrong": string;
  "sign.detail.preflightInstructionBefore": string;
  "sign.detail.preflightInstructionMid": string;
  "sign.detail.preflightInstructionEnd": string;
  "sign.detail.portalRef": string;
  "sign.detail.pdfView": string;
  "sign.detail.pdfViewTitle": string;
  "sign.detail.pdfExplainer": string;
  "sign.detail.editorButton": string;
  "sign.detail.sendDirect": string;
  "sign.detail.sendDirectTitleOk": string;
  "sign.detail.sendDirectTitleBlocked": string;
  "sign.detail.withMessage": string;
  "sign.detail.sendMessageTitleOk": string;
  "sign.detail.sendMessageTitleBlocked": string;
  "sign.detail.remindAll": string;
  "sign.detail.remindAllTitle": string;
  "sign.detail.remindMessageTitle": string;
  "sign.detail.archivePdf": string;
  "sign.detail.archivePdfTitle": string;
  "sign.detail.repeatSend": string;
  "sign.detail.repeatSendTitle": string;
  "sign.detail.openDraft": string;
  "sign.detail.openDetail": string;
  "sign.detail.delete": string;
  "sign.detail.recipientsWithCount": string;
  "sign.detail.recipients": string;
  "sign.detail.orderHelp": string;
  "sign.detail.parallelHelp": string;
  "sign.detail.noRecipientsYet": string;
  "sign.sidebar.listCoreLab": string;
  "sign.sidebar.privateVisible": string;
  "sign.sidebar.teamVisible": string;
  "sign.sidebar.onlyMe": string;
  "sign.sidebar.team": string;
  "sign.sidebar.listNote": string;
  "sign.sidebar.listReadOnly": string;
  "sign.sidebar.source": string;
  "sign.sidebar.sourceUpload": string;
  "sign.sidebar.sourceTemplate": string;
  "sign.sidebar.sourceTemplateDirect": string;
  "sign.sidebar.visibility": string;
  "sign.sidebar.visTeam": string;
  "sign.sidebar.visManager": string;
  "sign.sidebar.visAdmin": string;
  "sign.sidebar.timestamps": string;
  "sign.sidebar.created": string;
  "sign.sidebar.updated": string;
  "sign.sidebar.completed": string;
  "sign.sidebar.owner": string;
  "sign.sidebar.progress": string;
  "sign.sidebar.signedFraction": string;
  "sign.recipient.stepTitle": string;
  "sign.recipient.parallelTitle": string;
  "sign.recipient.opened": string;
  "sign.recipient.copyLinkTitle": string;
  "sign.recipient.link": string;
  "sign.recipient.remindTitle": string;
  "sign.recipient.remind": string;
  "sign.recipient.messageTitle": string;
  "sign.prompt.copySignLink": string;
  "sign.compose.sendNow": string;
  "sign.compose.remindSend": string;
  "sign.compose.headlineSend": string;
  "sign.compose.headlineRemindOne": string;
  "sign.compose.headlineRemindAll": string;
  "sign.compose.introSend": string;
  "sign.compose.introRemind": string;
  "sign.compose.subjectLabel": string;
  "sign.compose.subjectPlaceholder": string;
  "sign.compose.messageLabel": string;
  "sign.compose.messagePlaceholder": string;
  "sign.role.SIGNER": string;
  "sign.role.APPROVER": string;
  "sign.role.VIEWER": string;
  "sign.role.CC": string;
  "sign.role.ASSISTANT": string;
  "sign.editor.field.signature": string;
  "sign.editor.field.initials": string;
  "sign.editor.field.date": string;
  "sign.editor.field.text": string;
  "sign.editor.field.name": string;
  "sign.editor.field.hint.signature": string;
  "sign.editor.field.hint.initials": string;
  "sign.editor.field.hint.date": string;
  "sign.editor.field.hint.text": string;
  "sign.editor.field.hint.name": string;
  "sign.editor.persistEmpty": string;
  "sign.editor.alert.needRecipient": string;
  "sign.editor.alert.validEmail": string;
  "sign.editor.alert.needSignature": string;
  "sign.editor.alert.fieldRecipientMismatch": string;
  "sign.editor.confirm.removeRecipient": string;
  "sign.editor.recipientSave": string;
  "sign.editor.send": string;
  "sign.editor.resend": string;
  "sign.editor.recipientsHeading": string;
  "sign.editor.addRecipientTitle": string;
  "sign.editor.noRecipients": string;
  "sign.editor.role.approver": string;
  "sign.editor.shortcuts": string;
  "sign.editor.removeFieldAria": string;
  "sign.editor.activeFor": string;
  "sign.editor.workflowStrong": string;
  "sign.editor.workflowBody": string;
  "sign.editor.placeOnPdf": string;
  "sign.editor.sendFailed": string;
  "sign.editor.missingSigIntro": string;
  "sign.editor.placeFieldsLead": string;
  "sign.editor.fieldsCountOne": string;
  "sign.editor.fieldsCountMany": string;
  "sign.editor.mobileHint": string;
  "sign.editor.recipientsCountOne": string;
  "sign.editor.recipientsCountMany": string;
  "sign.editor.trayHeading": string;
  "sign.editor.trayHint": string;
  "sign.editor.loadingPdf": string;
  "sign.editor.fieldOverlayTitle": string;
  "sign.editor.toolbarHints": string;
  "sign.editor.placeholder.name": string;
  "sign.editor.placeholder.email": string;
  "sign.editor.removeRecipientTitle": string;
  "sign.editor.orderTitle": string;
  "sign.editor.roleOption.signer": string;
  "sign.editor.roleOption.viewer": string;
  "sign.editor.pdfDownloadFailed": string;
  "sign.editor.pageIndicator": string;

  // ─── Pane shell (ThreePaneLayout, resizers) ─────────────────────────
  "pane.mobile.backToList": string;
  "pane.sidebar.expand": string;
  "pane.sidebar.collapse": string;
  "pane.sidebar.toggleAria": string;
  "pane.sidebar.showTitle": string;
  "pane.splitter.resizeWidth": string;
  "pane.sidebar.dragResize": string;

  // ─── Calls ──────────────────────────────────────────────────────────
  "calls.title": string;
  "calls.newCall": string;
  "calls.active": string;
  "calls.history": string;
  "calls.empty.list": string;
  "calls.empty.selection": string;
  "calls.composer.subject": string;
  "calls.composer.start": string;
  "calls.composer.title": string;
  "calls.composer.subjectPlaceholder": string;
  "calls.composer.contextLabel": string;
  "calls.composer.unlinkTitle": string;
  "calls.composer.contextHint": string;
  "calls.list.header.active": string;
  "calls.list.header.all": string;
  "calls.search.placeholder": string;
  "calls.alert.startFailed": string;
  "calls.alert.endFailed": string;
  "calls.defaultSubject": string;
  "calls.empty.filtered.title": string;
  "calls.empty.filtered.hint": string;
  "calls.selection.title": string;
  "calls.selection.hint": string;
  "calls.context.crmContact": string;
  "calls.context.chatRoom": string;
  "calls.context.projectIssue": string;
  "calls.context.adhoc": string;
  "calls.context.ticket": string;
  "calls.detail.join": string;
  "calls.detail.openNewTab": string;
  "calls.detail.endCall": string;
  "calls.detail.ended": string;
  "calls.detail.startedBy": string;
  "calls.detail.durationLabel": string;
  "calls.detail.endedWithDuration": string;
  "calls.detail.section.participants": string;
  "calls.detail.section.context": string;
  "calls.detail.section.room": string;
  "calls.detail.online": string;
  "calls.detail.noParticipantsYet": string;
  "calls.detail.copyInviteTitle": string;
  "calls.detail.copyLink": string;
  "calls.detail.adhocNoLink": string;
  "calls.meeting.backToList": string;
  "calls.meeting.leave": string;
  "calls.meeting.maximize": string;
  "calls.meeting.minimize": string;
  "calls.meeting.openNewTab": string;
  "calls.meeting.copyInvite": string;
  "calls.meeting.listBackTooltip": string;
  "calls.conn.qualityTitle": string;
  "calls.conn.good": string;
  "calls.conn.ok": string;
  "calls.conn.poor": string;
  "calls.stage.activeParticipantsTitle": string;
  "calls.stage.ariaActiveCall": string;
  "calls.stage.pipSubtitleActive": string;
  "calls.confirm.endForEveryone": string;
  "calls.shell.backTooltip": string;
  "calls.incoming.portalTitle": string;
  "calls.incoming.chatVoiceShort": string;
  "calls.incoming.chatVideoShort": string;
  "calls.incoming.chatVoiceLong": string;
  "calls.incoming.chatVideoLong": string;
  "calls.incoming.dismissTitle": string;
  "calls.incoming.accept": string;
  "calls.incoming.acceptHereSuffix": string;
  "calls.incoming.openInWindow": string;
  "calls.incoming.popupWindow": string;
  "calls.incoming.chatOnlyLink": string;
  "calls.incoming.chatOnlyButton": string;
  "calls.incoming.jitsiLink": string;
  "calls.incoming.jitsiNewWindow": string;
  "calls.incoming.allowDesktopNotify": string;
  "calls.incoming.footerSignedInPrefix": string;
  "calls.incoming.footerHint": string;
  "calls.incoming.tabTitlePrefix": string;

  // ─── Chat ───────────────────────────────────────────────────────────
  "chat.createMenuTitle": string;
  "chat.newChannel": string;
  "chat.newDm": string;
  "chat.channelsSection": string;
  "chat.channelsEmpty": string;
  "chat.dmSection": string;
  "chat.dmEmpty": string;
  "chat.refreshRooms": string;
  "chat.sidebarResizeAria": string;
  "chat.pickRoomHint": string;
  "chat.backToChannelListAria": string;
  "chat.generalChannel": string;
  "chat.privateAria": string;
  "chat.lastActivePrefix": string;
  "chat.videoCallTitle": string;
  "chat.video": string;
  "chat.voiceCallTitle": string;
  "chat.tel": string;
  "chat.filesTitle": string;
  "chat.files": string;
  "chat.channelSettings": string;
  "chat.loadingMessages": string;
  "chat.noMessagesYet": string;
  "chat.dropFileHint": string;
  "chat.removeAttachmentTitle": string;
  "chat.captionPlaceholder": string;
  "chat.messageTo": string;
  "chat.sendTitle": string;
  "chat.composerHintDesktop": string;
  "chat.composerHintMobile": string;
  "chat.alert.uploadFailed": string;
  "chat.alert.sendFailed": string;
  "chat.alert.startCallFailed": string;
  "chat.defaultMeetingSubject": string;
  "chat.drawer.closeTitle": string;
  "chat.drawer.closeAria": string;
  "chat.tab.members": string;
  "chat.tab.files": string;
  "chat.tab.settings": string;
  "chat.members.confirmRemove": string;
  "chat.members.removeTooltip": string;
  "chat.members.forbiddenRemove": string;
  "chat.members.invite": string;
  "chat.members.loading": string;
  "chat.members.none": string;
  "chat.members.ownerAria": string;
  "chat.members.moderator": string;
  "chat.members.member": string;
  "chat.members.inviteModalTitle": string;
  "chat.members.errorStatus": string;
  "chat.files.loading": string;
  "chat.files.empty": string;
  "chat.settings.sectionDescription": string;
  "chat.settings.topicPlaceholder": string;
  "chat.settings.discard": string;
  "chat.settings.save": string;
  "chat.settings.visibility": string;
  "chat.settings.private": string;
  "chat.settings.public": string;
  "chat.settings.privateHint": string;
  "chat.settings.publicHint": string;
  "chat.settings.visibilityConfirm": string;
  "chat.settings.visibilityPublicWord": string;
  "chat.settings.visibilityPrivateWord": string;
  "chat.settings.toggleVisibility": string;
  "chat.settings.archiveConfirm": string;
  "chat.settings.archive": string;
  "chat.settings.restricted": string;
  "chat.inviteOnlySidebarHint": string;
  "chat.members.inviteForbidden": string;
  "chat.members.userNotFound": string;
  "chat.members.searchPlaceholder": string;
  "chat.members.searching": string;
  "chat.members.noResults": string;
  "chat.files.channelCountOne": string;
  "chat.files.channelCountMany": string;
  "chat.files.loadingLabel": string;
  "chat.files.emptyDetail": string;
  "chat.sidebar.emptyTeamsLine1": string;
  "chat.sidebar.emptyTeamsLine2": string;
  "chat.team.noChannelsYet": string;
  "chat.settings.dangerZone": string;
  "chat.settings.archiveHint": string;

  "chat.newDmModal.title": string;
  "chat.newDmModal.placeholder": string;
  "chat.newDmModal.searching": string;
  "chat.newDmModal.noResults": string;

  "chat.newChannelModal.title": string;
  "chat.newChannelModal.nameLabel": string;
  "chat.newChannelModal.namePlaceholder": string;
  "chat.newChannelModal.slugSavedAsPrefix": string;
  "chat.newChannelModal.topicLabel": string;
  "chat.newChannelModal.topicPlaceholder": string;
  "chat.newChannelModal.teamLabel": string;
  "chat.newChannelModal.noTeamOption": string;
  "chat.newChannelModal.teamHint": string;
  "chat.newChannelModal.publicHint": string;
  "chat.newChannelModal.createButton": string;
  "chat.newChannelModal.errorMinLength": string;
  "chat.newChannelModal.errorDuplicateName": string;
  "chat.newChannelModal.errorGeneric": string;

  "chat.bubble.meetingLink": string;
  "chat.bubble.fileFallback": string;
  "chat.bubble.attachmentFallback": string;

  "chat.invite.pastVoiceSelf": string;
  "chat.invite.pastVideoSelf": string;
  "chat.invite.pastVoiceOther": string;
  "chat.invite.pastVideoOther": string;
  "chat.invite.activeVoice": string;
  "chat.invite.activeVideo": string;
  "chat.invite.sameRoomParen": string;
  "chat.invite.join": string;
  "chat.invite.linkLabel": string;
  "chat.invite.historySameRoomPrefix": string;
  "chat.invite.when.today": string;
  "chat.invite.when.yesterday": string;
  "chat.invite.when.sameDayRange": string;

  "chat.overlay.chromeTitleVoice": string;
  "chat.overlay.chromeTitleVideo": string;
  "chat.overlay.endCall": string;
  "chat.overlay.participantFallback": string;
  "chat.overlay.jitsiAppSuffix": string;

  // ─── Projects ───────────────────────────────────────────────────────
  "projects.view.board": string;
  "projects.view.backlog": string;
  "projects.view.sprints": string;
  "projects.view.roadmap": string;
  "projects.view.list": string;
  "projects.newIssue": string;
  "projects.newProject": string;
  "projects.empty.list": string;
  "projects.empty.selection": string;
  "projects.import": string;
  "projects.import.title": string;
  "projects.import.description": string;
  "projects.import.upload": string;
  "projects.import.paste": string;
  "projects.import.delimiter": string;
  "projects.import.delimiter.auto": string;
  "projects.import.preview": string;
  "projects.import.mapping": string;
  "projects.import.mapping.column": string;
  "projects.import.mapping.field": string;
  "projects.import.field.ignore": string;
  "projects.import.field.name": string;
  "projects.import.field.description": string;
  "projects.import.field.state": string;
  "projects.import.field.priority": string;
  "projects.import.field.assignee": string;
  "projects.import.field.labels": string;
  "projects.import.field.startDate": string;
  "projects.import.field.targetDate": string;
  "projects.import.field.estimatePoint": string;
  "projects.import.totals.rows": string;
  "projects.import.totals.valid": string;
  "projects.import.totals.skipped": string;
  "projects.import.totals.unmapped": string;
  "projects.import.autoLabels": string;
  "projects.import.run": string;
  "projects.import.running": string;
  "projects.import.done": string;
  "projects.import.failed": string;
  "projects.import.empty": string;
  "projects.import.help.jira": string;
  "projects.delete.action": string;
  "projects.delete.confirm": string;
  "projects.delete.failed": string;
  "projects.settings.lead": string;
  "projects.settings.link.portalViews": string;
  "projects.settings.link.planeHub": string;
  "projects.settings.link.openPlane": string;
  "projects.settings.link.profile": string;
  "projects.settings.instance": string;
  "projects.settings.crumbSettings": string;

  "projects.priority.urgent": string;
  "projects.priority.high": string;
  "projects.priority.medium": string;
  "projects.priority.low": string;
  "projects.priority.none": string;
  "projects.stateGroup.backlog": string;
  "projects.stateGroup.unstarted": string;
  "projects.stateGroup.started": string;
  "projects.stateGroup.completed": string;
  "projects.stateGroup.cancelled": string;
  "projects.issueType.story": string;
  "projects.issueType.task": string;
  "projects.issueType.bug": string;
  "projects.issueType.epic": string;
  "projects.issueType.subtask": string;
  "projects.cycle.current": string;
  "projects.cycle.upcoming": string;
  "projects.cycle.completed": string;
  "projects.cycle.draft": string;
  "projects.groupBy.status": string;
  "projects.groupBy.assignee": string;
  "projects.groupBy.priority": string;
  "projects.groupBy.type": string;
  "projects.groupBy.epic": string;
  "projects.board.groupBy": string;
  "projects.board.quickFilter": string;
  "projects.board.quickFilterReset": string;
  "projects.board.assigneeFilterTitle": string;
  "projects.board.doneFraction": string;
  "projects.board.doneWord": string;
  "projects.board.assignedCount": string;
  "projects.board.completedRatio": string;
  "projects.board.createPlaceholder": string;
  "projects.board.createIssue": string;
  "projects.sprint.noWindow": string;
  "projects.sprint.closed": string;
  "projects.sprint.noEnd": string;
  "projects.sprint.overdueDays": string;
  "projects.sprint.endsToday": string;
  "projects.sprint.oneDayLeft": string;
  "projects.sprint.daysLeft": string;
  "projects.column.nobody": string;
  "projects.column.unknownEpic": string;
  "projects.column.noEpic": string;
  "projects.stat.issues": string;
  "projects.stat.done": string;
  "projects.stat.inProgress": string;
  "projects.stat.points": string;
  "projects.sprints.header": string;
  "projects.sprints.newTooltip": string;
  "projects.sprints.namePh": string;
  "projects.sprints.cancel": string;
  "projects.sprints.create": string;
  "projects.sprints.empty": string;
  "projects.sprints.pick": string;
  "projects.sprints.editTooltip": string;
  "projects.sprints.deleteTooltip": string;
  "projects.sprints.deleteConfirm": string;
  "projects.card.due": string;
  "projects.card.subIssues": string;
  "projects.card.unassigned": string;
  "projects.card.pointsTooltip": string;
  "projects.crumb.projects": string;
  "projects.empty.pickSidebar": string;
  "projects.loadingInline": string;
  "projects.issueRow.placeholder": string;
  "projects.count.issuesShown": string;
  "projects.link.planeHubTitle": string;
  "projects.openPlaneTooltip": string;
  "projects.reloadTooltip": string;
  "projects.starTooltip": string;
  "projects.button.newIssue": string;
  "projects.prompt.newProjectName": string;
  "projects.prompt.projectKey": string;
  "projects.alert.createProject": string;
  "projects.alert.createIssue": string;
  "projects.alert.saveIssue": string;
  "projects.alert.deleteIssueConfirm": string;
  "projects.alert.deleteIssue": string;
  "projects.alert.cycleAssign": string;
  "projects.alert.createCycle": string;
  "projects.alert.saveCycle": string;
  "projects.alert.deleteCycle": string;
  "projects.sidebar.expand": string;
  "projects.list.filteredEmpty": string;
  "projects.filter.priorityLabel": string;
  "projects.filter.assigneeLabel": string;
  "projects.filter.labelsHeading": string;
  "projects.filter.reset": string;
  "projects.searchIssues": string;
  "projects.issueDrawer.closeTooltip": string;
  "projects.issueDrawer.descriptionSection": string;
  "projects.issueDrawer.descriptionPlaceholder": string;
  "projects.issueDrawer.issueTypeLabel": string;
  "projects.issueDrawer.selectPlaceholder": string;
  "projects.issueDrawer.priorityLabel": string;
  "projects.issueDrawer.assigneesLabel": string;
  "projects.issueDrawer.sprintLabel": string;
  "projects.issueDrawer.backlogOption": string;
  "projects.issueDrawer.sprintActiveBadge": string;
  "projects.issueDrawer.sprintPlannedBadge": string;
  "projects.issueDrawer.sprintEndsPrefix": string;
  "projects.issueDrawer.parentIssueLabel": string;
  "projects.issueDrawer.noParentOption": string;
  "projects.issueDrawer.storyPointsLabel": string;
  "projects.issueDrawer.startLabel": string;
  "projects.issueDrawer.dueLabel": string;
  "projects.issueDrawer.createdPrefix": string;
  "projects.issueDrawer.updatedPrefix": string;
  "projects.issueDrawer.completedPrefix": string;
  "projects.issueDrawer.deleteIssue": string;
  "projects.issueDrawer.subtasksTitle": string;
  "projects.issueDrawer.subtasksWithCount": string;
  "projects.issueDrawer.addSubtask": string;
  "projects.issueDrawer.subtaskPlaceholder": string;
  "projects.issueDrawer.createButton": string;
  "projects.issueDrawer.addAnotherSubtask": string;
  "projects.issueDrawer.activityTitle": string;
  "projects.issueDrawer.activityWithCount": string;
  "projects.issueDrawer.loading": string;
  "projects.issueDrawer.unknownAuthor": string;
  "projects.issueDrawer.commentFailedPrefix": string;
  "projects.issueDrawer.commentPlaceholder": string;
  "projects.issueDrawer.sendButton": string;
  "projects.backlog.selectedCount": string;
  "projects.backlog.moveToSprint": string;
  "projects.backlog.move": string;
  "projects.backlog.clearSelection": string;
  "projects.backlog.startSprintConfirm": string;
  "projects.backlog.completeSprintConfirm": string;
  "projects.backlog.startSprintTooltip": string;
  "projects.backlog.startSprint": string;
  "projects.backlog.completeSprintTooltip": string;
  "projects.backlog.complete": string;
  "projects.backlog.newIssueTooltip": string;
  "projects.backlog.emptyBacklog": string;
  "projects.backlog.emptySprint": string;
  "projects.backlog.badgeActive": string;
  "projects.backlog.badgePlanned": string;
  "projects.roadmap.title": string;
  "projects.roadmap.subtitle": string;
  "projects.roadmap.weeks": string;
  "projects.roadmap.months": string;
  "projects.roadmap.today": string;
  "projects.roadmap.todayTooltip": string;
  "projects.roadmap.sprintColumn": string;
  "projects.roadmap.empty": string;
  "projects.roadmap.weekLabel": string;
  "projects.roadmap.resizeEndTooltip": string;

  // ─── Files / Office ────────────────────────────────────────────────
  "files.upload": string;
  "files.newFolder": string;
  "files.newDocument": string;
  "files.newSpreadsheet": string;
  "files.newPresentation": string;
  "files.newNote": string;
  "files.empty": string;
  "files.title": string;
  "files.myDrive": string;
  "files.subtitle": string;
  "files.search.here": string;
  "files.search.everywhere": string;
  "files.search.titleHere": string;
  "files.search.titleEverywhere": string;
  "files.allFolders": string;
  "files.newTooltip": string;
  "files.plusNew": string;
  "files.menu.doc": string;
  "files.menu.docHint": string;
  "files.menu.sheet": string;
  "files.menu.sheetHint": string;
  "files.menu.slides": string;
  "files.menu.slidesHint": string;
  "files.menu.note": string;
  "files.menu.noteHint": string;
  "files.menu.folder": string;
  "files.menu.folderHint": string;
  "files.menu.uploadHint": string;
  "files.upload.tooltip": string;
  "files.reload": string;
  "files.detail.toggleHide": string;
  "files.detail.toggleShow": string;
  "files.prompt.newFile": string;
  "files.prompt.newFolder": string;
  "files.alert.mkdir": string;
  "files.alert.delete": string;
  "files.alert.createDoc": string;
  "files.alert.uploadPrefix": string;
  "files.confirm.delete": string;
  "files.alert.presentationId": string;
  "files.search.minChars": string;
  "files.search.running": string;
  "files.search.none": string;
  "files.search.error": string;
  "files.column.name": string;
  "files.column.modified": string;
  "files.column.size": string;
  "files.detail.pick": string;
  "files.kind.folder": string;
  "files.kind.file": string;
  "files.path": string;
  "files.download": string;
  "files.openInFolder": string;
  "files.open.folder": string;
  "files.open.portalEditor": string;
  "files.open.presentationEditor": string;
  "files.open.preview": string;

  "marketing.title": string;
  "marketing.subtitleMautic": string;
  "marketing.settingsTooltip": string;
  "marketing.openMauticTooltip": string;
  "marketing.section.overview": string;
  "marketing.section.contacts": string;
  "marketing.section.segments": string;
  "marketing.section.campaigns": string;
  "marketing.section.emails": string;
  "marketing.kpi.contacts": string;
  "marketing.kpi.active7d": string;
  "marketing.kpi.segments": string;
  "marketing.kpi.campaigns": string;
  "marketing.kpi.campaignActiveSuffix": string;
  "marketing.visibleCount": string;
  "marketing.reloadTooltip": string;
  "marketing.searchPlaceholder": string;
  "marketing.notConfiguredBanner": string;
  "marketing.notConfiguredDetailTitle": string;
  "marketing.setup.openUi": string;
  "marketing.setup.adminUser": string;
  "marketing.setup.apiSettings": string;
  "marketing.setup.portalUser": string;
  "marketing.setup.envKeys": string;
  "marketing.pickRecordTitle": string;
  "marketing.pickRecordHint": string;
  "marketing.contactFallback": string;
  "marketing.overview.loading": string;
  "marketing.overview.setupHint": string;
  "marketing.overview.noData": string;
  "marketing.tile.activeCampaigns": string;
  "marketing.tile.emailsPublished": string;
  "marketing.tile.sendsTotal": string;
  "marketing.tile.sendsHint": string;
  "marketing.tile.segments": string;
  "marketing.openMauticUi": string;
  "marketing.detail.overviewTitle": string;
  "marketing.detail.overviewSubtitle": string;
  "marketing.noOverview": string;
  "marketing.bigKpi.contactsSub": string;
  "marketing.bigKpi.segmentsSub": string;
  "marketing.bigKpi.campaignsSub": string;
  "marketing.bigKpi.emailsSub": string;
  "marketing.bigKpi.sentSub": string;
  "marketing.bigKpi.sentHint": string;
  "marketing.nextStepsTitle": string;
  "marketing.nextSteps.crmSegments": string;
  "marketing.nextSteps.drip": string;
  "marketing.nextSteps.smtp": string;
  "marketing.nextSteps.form": string;
  "marketing.crm.openInTwenty": string;
  "marketing.crm.searching": string;
  "marketing.crm.noPersonForEmail": string;
  "marketing.crm.unnamedPerson": string;
  "marketing.sidebar.crm": string;
  "marketing.sidebar.properties": string;
  "marketing.sidebar.tags": string;
  "marketing.contact.fieldsHeading": string;
  "marketing.contact.pointsLabel": string;
  "marketing.contact.stageLabel": string;
  "marketing.email.createdLabel": string;
  "marketing.email.typeLabel": string;
  "marketing.detail.openInMautic": string;
  "marketing.activity.last": string;
  "marketing.segment.noDescription": string;
  "marketing.segment.statusPublished": string;
  "marketing.segment.statusDraft": string;
  "marketing.campaign.activatedToast": string;
  "marketing.campaign.pausedToast": string;
  "marketing.campaign.cloneFull": string;
  "marketing.campaign.cloneMeta": string;
  "marketing.campaign.startHint": string;
  "marketing.campaign.pauseTooltip": string;
  "marketing.campaign.pause": string;
  "marketing.campaign.start": string;
  "marketing.campaign.duplicateTooltip": string;
  "marketing.campaign.duplicate": string;
  "marketing.campaign.editor": string;
  "marketing.campaign.noCategory": string;
  "marketing.builderHint": string;
  "marketing.email.designerInMautic": string;
  "marketing.email.opened": string;
  "marketing.email.openRate": string;
  "marketing.email.statusPublished": string;

  "office.openIn": string;
  "office.tagline": string;
  "office.search.placeholder": string;
  "office.upload": string;
  "office.reload": string;
  "office.crmContext": string;
  "office.link.companyHub": string;
  "office.link.sign": string;
  "office.section.new": string;
  "office.hint.portalEditor": string;
  "office.compat.word": string;
  "office.compat.excel": string;
  "office.compat.ppt": string;
  "office.compat.md": string;
  "office.createTitle": string;
  "office.proposal.title": string;
  "office.proposal.subtitle": string;
  "office.proposal.mergeVersionLine": string;
  "office.proposal.sectionTemplate": string;
  "office.proposal.templatePresets": string;
  "office.proposal.templateCloudDocs": string;
  "office.proposal.sectionVariables": string;
  "office.proposal.sectionCompany": string;
  "office.proposal.loadingCompanies": string;
  "office.proposal.preview": string;
  "office.proposal.downloadDocx": string;
  "office.proposal.tokensFound": string;
  "office.proposal.footerMergeZip": string;
  "office.proposal.cloudFormatsHint": string;
  "office.proposal.loadingTemplateFile": string;
  "office.proposal.loadingDocList": string;
  "office.proposal.noTemplatesInFolder": string;
  "office.proposal.activeTemplate": string;
  "office.proposal.conversionNote": string;
  "office.proposal.error.pickCompany": string;
  "office.proposal.error.pickCloudTemplate": string;
  "office.proposal.error.noPresetTemplate": string;
  "office.recents": string;
  "office.empty": string;
  "office.prompt.filename": string;
  "office.alert.create": string;
  "office.alert.upload": string;
  "office.alert.presentationId": string;
};

const de: Messages = {
  "common.loading": "Wird geladen …",
  "common.save": "Speichern",
  "common.cancel": "Abbrechen",
  "common.delete": "Löschen",
  "common.edit": "Bearbeiten",
  "common.close": "Schließen",
  "common.search": "Suchen",
  "common.refresh": "Aktualisieren",
  "common.open": "Öffnen",
  "common.back": "Zurück",
  "common.new": "Neu",
  "common.send": "Senden",
  "common.reply": "Antworten",
  "common.replyAll": "Allen antworten",
  "common.forward": "Weiterleiten",
  "common.settings": "Einstellungen",
  "common.filter": "Filter",
  "common.more": "Mehr",
  "common.all": "Alle",
  "common.none": "Keine",
  "common.empty": "Leer",
  "common.noResults": "Keine Treffer.",
  "common.noEntries": "Keine Einträge.",
  "common.error": "Fehler",
  "common.retry": "Erneut versuchen",
  "error.workspaceTitle": "Diese Ansicht ist abgestürzt",
  "error.workspaceLead": "Eine Komponente innerhalb des Workspaces hat eine Ausnahme geworfen. Sidebar und TopBar bleiben verfügbar — du kannst die Ansicht zurücksetzen oder die Seite komplett neu laden.",
  "error.retry": "Ansicht zurücksetzen",
  "error.reloadPage": "Seite neu laden",
  "common.upload": "Hochladen",
  "common.download": "Herunterladen",
  "common.copy": "Kopieren",
  "common.copied": "Kopiert",
  "common.create": "Anlegen",
  "common.add": "Hinzufügen",
  "common.remove": "Entfernen",
  "common.confirm": "Bestätigen",
  "common.yes": "Ja",
  "common.no": "Nein",
  "common.from": "Von",
  "common.to": "An",
  "common.subject": "Betreff",
  "common.date": "Datum",
  "common.status": "Status",
  "common.priority": "Priorität",
  "common.assignee": "Zugewiesen an",
  "common.author": "Autor",
  "common.title": "Titel",
  "common.description": "Beschreibung",
  "common.notes": "Notizen",
  "common.attachments": "Anlagen",
  "common.activity": "Aktivität",
  "common.details": "Details",
  "common.today": "Heute",
  "common.yesterday": "Gestern",
  "common.dateUnknown": "Unbekannt",
  "common.openInNewTab": "In neuem Tab öffnen",
  "common.reload": "Neu laden",
  "common.thisWeek": "Diese Woche",
  "common.relative.justNow": "gerade eben",
  "common.relative.minutesAgo": "vor {n} Min",
  "common.relative.hoursAgo": "vor {n} Std",
  "common.relative.daysAgoOne": "vor 1 Tag",
  "common.relative.daysAgoMany": "vor {n} Tagen",
  "common.menu.open": "Menü öffnen",
  "common.menu.close": "Menü schließen",

  "login.heading": "Corehub Workstation",
  "login.subtitle":
    "Eine Anmeldung. Alle Tools. Ein Arbeitsplatz für Corehub, MedTheris und Kineo.",
  "login.cta": "Mit Kineo360 SSO anmelden",
  "login.divider": "Sicher via Keycloak",
  "login.help": "Über deinen Kineo360 SSO Account.",
  "login.problems": "Probleme beim Login? Schreib an",
  "login.subline": "Eine Anmeldung. Alle Tools.",
  "login.cardTitle": "Anmelden",
  "login.errorPrefix": "Login fehlgeschlagen:",
  "login.brandBar": "Corehub · Workstation",
  "login.internalBadge": "Internal",

  "nav.dashboard": "Dashboard",
  "nav.mail": "Mail",
  "nav.chat": "Chat",
  "nav.calendar": "Kalender",
  "nav.calls": "Calls",
  "nav.files": "Dateien",
  "nav.gapReport": "Gap Report",
  "nav.office": "Office",
  "nav.crm": "CRM",
  "nav.helpdesk": "Helpdesk",
  "nav.projects": "Projekte",
  "nav.sign": "Sign",
  "nav.code": "Code",
  "nav.status": "Status",
  "nav.identity": "Identity",
  "nav.proxy": "Reverse Proxy",
  "nav.admin": "Admin",
  "nav.onboarding": "Onboarding",
  "nav.opsDashboard": "Operations Dashboard",
  "nav.marketing": "Marketing",
  "nav.aiKnowledge": "AI-Wissen",
  "nav.dashboard.short": "Übersicht",
  "nav.badge.soon": "bald",

  "sidebar.healthUnknown": "Status unbekannt",
  "sidebar.healthAllUp": "Alle Systeme online · {up}/{total}",
  "sidebar.healthPartialDown": "{down} ausgefallen · {up}/{total}",
  "sidebar.healthLastCheck": "Letzter Check: {time}",

  "pulse.titleWithWorkspace": "Pulse · {name}",
  "pulse.titleDefault": "Live · dein Pulse",
  "pulse.updated": "aktualisiert {time}",
  "pulse.mail.unread": "Ungelesene Mails",
  "pulse.mail.hintTotal": "{total} insgesamt im Posteingang",
  "pulse.mail.inboxEmpty": "Posteingang leer",
  "pulse.mail.offlineHint": "Verbindung zu IMAP fehlgeschlagen",
  "pulse.tasks.today": "Heute fällig",
  "pulse.tasks.notInWorkspace": "Noch nicht in Plane Workspace „{slug}“",
  "pulse.tasks.noProjects": "Keine Projekte im Workspace",
  "pulse.tasks.openAssigned": "{n} offene Issues insgesamt",
  "pulse.tasks.apiUnreachable": "Plane-API nicht erreichbar",
  "pulse.chat.label": "Chat",
  "pulse.chat.hint": "Live-Counter folgt",
  "pulse.feed.label": "Integration",
  "pulse.feed.empty": "Noch keine Webhook-Events für diesen Workspace.",
  "pulse.feed.hintSignCompleted": "Sign · Dokument fertig",
  "pulse.feed.hubSign": "Signatur",
  "pulse.feed.hubHelpdesk": "Helpdesk",
  "pulse.feed.hubCrm": "CRM",
  "pulse.feed.hubProjects": "Projekte",
  "pulse.feed.hubOffice": "Office",
  "pulse.feed.hubCalendar": "Kalender",
  "pulse.feed.hubCommunication": "Chat",
  "pulse.feed.hubDefault": "Integration",

  "dash.inbox.title": "Posteingang heute",
  "dash.inbox.loadingSnapshot": "Live-Snapshot lädt …",
  "dash.inbox.allDone": "Alles abgearbeitet — gut gemacht.",
  "dash.inbox.waitingMany": "{n} Sachen warten auf dich",
  "dash.inbox.loading": "Lade …",
  "dash.inbox.mailUnread": "Mail ungelesen",
  "dash.inbox.allFoldersHint": "alle Ordner",
  "dash.inbox.ticketsOpen": "Tickets offen",
  "dash.inbox.ticketsWithSla": "{n} mit SLA-Risiko",
  "dash.inbox.ticketsNoSla": "ohne SLA-Risiko",
  "dash.inbox.slaRisk": "SLA-Risiko",
  "dash.inbox.slaRiskHint": "Tickets nahe Frist",
  "dash.inbox.helpdeskDisabled": "Helpdesk in diesem Workspace nicht konfiguriert.",

  "dash.myIssues.title": "Meine Issues heute",
  "dash.myIssues.loadingSnapshot": "Lade Plane-Snapshot …",
  "dash.myIssues.loadingShort": "Lade …",
  "dash.myIssues.subtitleOverdueLine":
    "{overdue} überfällig · {restDueToday} fällig heute",
  "dash.myIssues.subtitleDueToday": "{n} fällig heute",
  "dash.myIssues.subtitleOpenNoDue":
    "{n} offen — nichts mit Frist heute",
  "dash.myIssues.inboxZero": "Inbox-Zero. Cool.",
  "dash.myIssues.emptyBody":
    "Keine offenen Issues, die dir zugewiesen sind. Wenn das überrascht, sind sie evtl. einer Gruppe zugewiesen statt dir direkt.",
  "dash.myIssues.moreCount": "+ {n} weitere",
  "dash.myIssues.priorityTitle": "Priorität: {priority}",
  "dash.myIssues.due.today": "heute",
  "dash.myIssues.due.yesterday": "gestern",
  "dash.myIssues.due.tomorrow": "morgen",
  "dash.myIssues.due.daysAgo": "vor {n} d",
  "dash.myIssues.due.daysIn": "in {n} d",

  "dash.quickCapture.openAria": "Quick-Capture öffnen",
  "dash.quickCapture.toggleTitle": "Quick-Capture (⌘⇧N) · {n} Notizen",
  "dash.quickCapture.heading": "Quick-Capture",
  "dash.quickCapture.savedCount": "{n} gespeichert",
  "dash.quickCapture.placeholder": "Was willst du dir merken?",
  "dash.quickCapture.keyboardHints": "⌘↩ speichern · Esc abbrechen",
  "dash.quickCapture.save": "Speichern",

  "portal.helpdeskPublic.replySent": "Deine Antwort wurde gesendet.",
  "portal.helpdeskPublic.statusPrefix": "Status:",
  "portal.helpdeskPublic.priorityPrefix": "Priorität:",
  "portal.helpdeskPublic.metaOpenedUpdated":
    "Eröffnet {opened} · zuletzt aktualisiert {updated}",
  "portal.helpdeskPublic.refreshTitle": "Antworten neu laden",
  "portal.helpdeskPublic.refreshing": "Aktualisiert…",
  "portal.helpdeskPublic.refresh": "Aktualisieren",
  "portal.helpdeskPublic.noArticles": "Noch kein Verlauf.",
  "portal.helpdeskPublic.replyHeading": "Antworten",
  "portal.helpdeskPublic.replyPlaceholder":
    "Schreibe hier deine Antwort an das Support-Team…",
  "portal.helpdeskPublic.linkExpires": "Link aktiv bis",
  "portal.helpdeskPublic.sending": "Wird gesendet…",
  "portal.helpdeskPublic.sendReply": "Antwort senden",
  "portal.helpdeskPublic.footerMagicLink":
    "Diese Seite wurde dir per Magic-Link freigeschaltet. Niemand außer dem Support-Team kann ohne Link auf diese Seite zugreifen.",
  "portal.helpdeskPublic.unknownAuthor": "Unbekannt",

  "dash.greeting.morning": "Guten Morgen",
  "dash.greeting.day": "Guten Tag",
  "dash.greeting.evening": "Guten Abend",
  "dash.greeting.night": "Gute Nacht",
  "dash.quick.title": "Drei Hubs — Schnellzugriff",
  "dash.quick.subtitle": "Wie in der Produktvision",
  "dash.tips.heading": "Kurz und sinnvoll",

  "dash.followups.title": "Worauf du wartest",
  "dash.followups.busy": "Vergleiche Sent ↔ Inbox …",
  "dash.followups.ready": "Mail-Suche bereit.",
  "dash.followups.empty": "Keine offenen Threads älter als {days} Tage.",
  "dash.followups.summaryOne": "{n} Mail ohne Antwort seit {days} Tagen",
  "dash.followups.summaryMany": "{n} Mails ohne Antwort seit {days} Tagen",
  "dash.followups.thresholdTitle": "Schwellwert in Tagen",
  "dash.followups.comparing": "Vergleiche…",
  "dash.followups.allClear":
    "Alles im grünen Bereich. Wenn du gerade etwas Wichtiges rausgeschickt hast und es taucht hier nicht auf — schau später nochmal nach, der Trigger kickt nach {days} Tagen.",
  "dash.followups.recipientPrefix": "an {recipient}",
  "dash.followups.mailLink": "Mail",

  "dash.mentions.title": "Erwähnungen für dich",
  "dash.mentions.loading": "Lade Chat-Erwähnungen …",
  "dash.mentions.ready": "Bereit",
  "dash.mentions.empty": "Keine offenen @-Erwähnungen",
  "dash.mentions.summaryOne": "{n} Erwähnung in {rooms} Raum",
  "dash.mentions.summaryMany": "{n} Erwähnungen in {rooms} Räumen",
  "dash.mentions.refresh": "Aktualisieren",
  "dash.mentions.chatLink": "Chat",
  "dash.mentions.emptyHint":
    "Du hast aktuell keine offenen Erwähnungen. Wenn dich jemand mit @<dein-name> pingt, taucht es hier auf — auch wenn du im Chat selbst nicht eingeloggt bist.",
  "dash.mentions.breakdownTooltip":
    "{direct} direkte · {group} Gruppen-Erwähnungen",
  "dash.mentions.unreadInline": "{n} ungelesen",
  "dash.mentions.directInline": "{n}× direkt",
  "dash.mentions.groupInline": "{n}× @here",

  "dash.hub.communication.title": "Kommunikation",
  "dash.hub.office.title": "Office-Hub",
  "dash.hub.project.title": "Projekt-Hub",

  "dash.corehub.communication.blurb":
    "Mail, Chat, Kalender, Video-Calls — alles, was Gespräche bündelt.",
  "dash.corehub.office.blurb":
    "Dateien, Verträge, CRM — Inhalte und Kundenstammdaten.",
  "dash.corehub.project.blurb": "Lieferung — Issues, Boards und Repository.",

  "dash.corehub.hint.mail": "Posteingang & Team-Mail",
  "dash.corehub.hint.chat": "Kanäle & DMs",
  "dash.corehub.hint.calendar": "Termine & Slots",
  "dash.corehub.hint.calls": "Jitsi · Räume & Historie",
  "dash.corehub.hint.files": "Nextcloud Datei-Station",
  "dash.corehub.hint.office": "Word & Excel im Portal",
  "dash.corehub.hint.sign": "Documenso · Unterschriften",
  "dash.corehub.hint.crm": "Twenty · Pipeline",
  "dash.corehub.hint.aiKnowledge": "Firmen-Kontext für Antworten",
  "dash.corehub.hint.projects": "Plane · Issues & Board",
  "dash.corehub.hint.code": "Gitea · Repositories & CI",

  "dash.medtheris.communication.blurb":
    "Erstkontakt bis Support — ein Durchgang für den Kunden.",
  "dash.medtheris.office.blurb": "Angebote, Kampagnen, Dokumente.",
  "dash.medtheris.project.blurb": "Plane · Delivery und Zyklen.",

  "dash.medtheris.hint.mail": "Sales & Praxis-Kommunikation",
  "dash.medtheris.hint.chat": "Team-Kanäle",
  "dash.medtheris.hint.calendar": "Demos & Folgetermine",
  "dash.medtheris.hint.calls": "Video & Raumhistorie",
  "dash.medtheris.hint.helpdesk": "Zammad · Tickets",
  "dash.medtheris.hint.files": "Datei-Station",
  "dash.medtheris.hint.office": "Word & Excel im Portal",
  "dash.medtheris.hint.crm": "Twenty · Pipeline",
  "dash.medtheris.hint.marketing": "Mautic · Kampagnen",
  "dash.medtheris.hint.sign": "Documenso · Verträge",
  "dash.medtheris.hint.aiKnowledge": "Kontext für Mail, Tickets, SMS",
  "dash.medtheris.hint.projects": "Issues, Board, Zyklen",

  "dash.kineo.communication.blurb":
    "Group-Mail, Chat, Calls, interner Support.",
  "dash.kineo.office.blurb": "Dokumente, Partner-CRM, Signatur.",
  "dash.kineo.project.blurb": "OKRs und Initiativen in Plane.",

  "dash.kineo.hint.mail": "Group-Mailbox",
  "dash.kineo.hint.chat": "Leadership & Ops",
  "dash.kineo.hint.calls": "Video & Raumhistorie",
  "dash.kineo.hint.calendar": "Investor- & Team-Termine",
  "dash.kineo.hint.helpdesk": "Interne & Vendor-Tickets",
  "dash.kineo.hint.files": "Datei-Station",
  "dash.kineo.hint.office": "Dokumente im Portal",
  "dash.kineo.hint.crm": "Twenty · Partner-Pipeline",
  "dash.kineo.hint.sign": "Documenso · Verträge",
  "dash.kineo.hint.aiKnowledge": "Firmen-Kontext für Antworten",
  "dash.kineo.hint.projects": "Plane · Initiativen",

  "dash.corehub.tip1":
    "Die Sidebar gruppiert Apps in Kommunikation, Office-Hub und Projekt-Hub — wie in der Produktvision.",
  "dash.corehub.tip2":
    "Plane-Fälligkeiten siehst du oben im Pulse — Klick öffnet SSO in deinen Workspace.",
  "dash.corehub.tip3":
    "Native Apps laufen im Portal; Code/Gitea öffnet eingebettet oder im Tab.",

  "dash.medtheris.tip1":
    "Helpdesk sitzt bei Kommunikation; CRM, Office und Sign bündeln sich im Office-Hub.",
  "dash.medtheris.tip2":
    "Neue Leads landen nach dem Scraper-Lauf im CRM — Pipeline in Twenty prüfen.",
  "dash.medtheris.tip3":
    "Office-Hub: Word/Excel im Portal; Folien im OpenOffice-Editor über Nextcloud.",

  "dash.kineo.tip1":
    "Drei Hubs: Kommunikation (Mail bis Helpdesk), Office-Hub (Dateien und Verträge), Projekt-Hub (Plane).",
  "dash.kineo.tip2":
    "Video-Calls und Historie unter Calls; Kalender synchronisiert über CalDAV.",
  "dash.kineo.tip3":
    "Projekt-Hub für OKRs; CRM für Partner; Sign für dokumentierte Abschlüsse.",

  "section.overview": "Übersicht",
  "section.communication": "Kommunikation",
  "section.officeHub": "Office-Hub",
  "section.projectHub": "Projekt-Hub",
  "section.system": "System",

  "menu.signedInAs": "Angemeldet als",
  "menu.account": "Konto",
  "menu.mfaPassword": "MFA / Passwort",
  "menu.theme": "Design",
  "menu.language": "Sprache",
  "menu.refresh": "Sitzung aktualisieren",
  "menu.logout": "Abmelden",
  "menu.fullLogout.title":
    "Beendet die Sessions in allen Apps (Nextcloud, Chat, Code, Plane …) und meldet dich anschließend ab.",
  "menu.fullLogout.subtitle": "Empfohlen für User-Wechsel oder Test-Szenarien",
  "menu.fullLogout.action": "Aus allen Apps abmelden",
  "menu.logoutPortalOnly.title":
    "Beendet nur die Portal-Session. App-Sessions (Nextcloud, Chat …) bleiben aktiv.",

  "workspace.switcher": "Workspace wechseln",
  "workspace.search": "Workspace suchen …",

  "calendar.newEvent": "Neuer Termin",
  "calendar.title": "Titel",
  "calendar.start": "Start",
  "calendar.end": "Ende",
  "calendar.location": "Ort",
  "calendar.description": "Beschreibung",
  "calendar.allDay": "Ganztägig",
  "calendar.today": "Heute",
  "calendar.month": "Monat",
  "calendar.week": "Woche",
  "calendar.day": "Tag",
  "calendar.video.add": "Video-Call hinzufügen",
  "calendar.video.remove": "Video-Call entfernen",
  "calendar.video.label": "Video-Konferenz",
  "calendar.video.hint":
    "Erzeugt einen Jitsi-Raum und legt den Link in den Termin (Outlook-/Teams-Stil).",
  "calendar.video.join": "Jetzt beitreten",
  "calendar.defaultTitle": "(ohne Titel)",
  "calendar.defaultRoomSlug": "termin",
  "calendar.sidebar.calendars": "Kalender",
  "calendar.sidebar.loading": "Lade Kalender …",
  "calendar.sidebar.noCalendars": "Keine Kalender gefunden.",
  "calendar.sidebar.shared": "geteilt",
  "calendar.sidebar.browserTz": "Browser-Zeitzone",
  "calendar.sidebar.open": "Seitenleiste öffnen",
  "calendar.sidebar.close": "Seitenleiste schließen",
  "calendar.aria.back": "Zurück",
  "calendar.aria.forward": "Vor",
  "calendar.aria.refresh": "Aktualisieren",
  "calendar.view.label": "Ansicht",
  "calendar.view.schedulingTooltip":
    "Frei/Gebucht-Sicht über mehrere Personen",
  "calendar.view.scheduling": "Planung",
  "calendar.moreInMonth": "+{count} weitere",
  "calendar.allDayAbbrev": "ganztg.",
  "calendar.delete.confirm": "„{title}\" wirklich löschen?",
  "calendar.delete.failed": "Löschen fehlgeschlagen (HTTP {status})",
  "calendar.save.failed": "Fehler beim Speichern (HTTP {status})",
  "calendar.rsvp.failed": "RSVP fehlgeschlagen: {message}",
  "calendar.rsvp.accept": "Annehmen",
  "calendar.rsvp.tentative": "Vielleicht",
  "calendar.rsvp.decline": "Ablehnen",
  "calendar.rsvp.current": "Aktuell:",
  "calendar.skipOccurrence.confirm":
    "Diesen Termin aus der Serie ausblenden?",
  "calendar.drawer.close": "Schließen",
  "calendar.series.short": "Serie",
  "calendar.section.when": "Wann",
  "calendar.section.yourResponse": "Deine Antwort",
  "calendar.section.videoCall": "Video-Call",
  "calendar.section.attendees": "Teilnehmer",
  "calendar.section.reminders": "Erinnerungen",
  "calendar.section.recurrence": "Wiederholung",
  "calendar.section.description": "Beschreibung",
  "calendar.section.where": "Ort",
  "calendar.remoteTimesForYou":
    "Bei dir: {start}–{end} ({tz})",
  "calendar.recurrence.untilPrefix": "bis",
  "calendar.recurrence.countSuffix": "· {count} Termine",
  "calendar.skipSeriesOccurrence": "Diesen Termin aus Serie ausnehmen",
  "calendar.delete.action": "Löschen",
  "calendar.partstat.accepted": "Zugesagt",
  "calendar.partstat.declined": "Abgelehnt",
  "calendar.partstat.tentative": "Vielleicht",
  "calendar.partstat.needsAction": "Offen",
  "calendar.partstat.delegated": "Delegiert",
  "calendar.partstat.unknown": "—",
  "calendar.reminder.before5": "5 min vorher",
  "calendar.reminder.before15": "15 min vorher",
  "calendar.reminder.before30": "30 min vorher",
  "calendar.reminder.before60": "1 Std. vorher",
  "calendar.reminder.before1d": "1 Tag vorher",
  "calendar.reminder.channelEmail": "E-Mail",
  "calendar.reminder.channelPopup": "Pop-up",
  "calendar.reminder.line": "{when} · {channel}",
  "calendar.recurrence.none": "Einmalig",
  "calendar.recurrence.daily": "Täglich",
  "calendar.recurrence.weekly": "Wöchentlich",
  "calendar.recurrence.biweekly": "Alle 2 Wochen",
  "calendar.recurrence.monthly": "Monatlich",
  "calendar.recurrence.yearly": "Jährlich",
  "calendar.recurrence.custom": "Benutzerdefiniert",
  "calendar.recurrence.customPattern": "{freq} · alle {interval}",
  "calendar.compose.newTitle": "Neuer Termin",
  "calendar.compose.titlePlaceholder": "Was steht an?",
  "calendar.field.calendar": "Kalender",
  "calendar.field.date": "Datum",
  "calendar.field.start": "Beginn",
  "calendar.field.end": "Ende",
  "calendar.timesInTimezone": "Zeiten in {tz} ({offset})",
  "calendar.field.locationPlaceholder": "Raum, Adresse oder Link",
  "calendar.field.recurrence": "Wiederholung",
  "calendar.field.endsOn": "Endet am",
  "calendar.field.afterNOccurrences": "Nach N Terminen",
  "calendar.optional": "optional",
  "calendar.reminders.heading": "Erinnerungen",
  "calendar.reminders.none": "Keine Erinnerung gesetzt.",
  "calendar.attendees.label": "Teilnehmer (komma-getrennt)",
  "calendar.attendees.placeholder":
    "diana.matushkina@corehub.kineo360.work, …",
  "calendar.attendees.hint":
    "Teilnehmer erhalten eine Einladung mit Annehmen-/Ablehnen-Buttons (RFC 5545 ATTENDEE/RSVP).",
  "calendar.description.placeholder": "Agenda, Notizen, Links …",
  "calendar.compose.save": "Speichern",
  "calendar.video.toggleRemove": "Entfernen",
  "calendar.video.toggleAdd": "Hinzufügen",
  "calendar.video.testRoom": "Raum testen",
  "calendar.video.helpWhenOn":
    "Eindeutiger Jitsi-Raum. Wird in der Termin-Beschreibung als klickbarer Link verteilt und für moderne Clients zusätzlich als RFC-7986-CONFERENCE-Property gespeichert (Outlook 2024+ / Apple Calendar zeigen automatisch einen „Beitreten\"-Button).",
  "calendar.video.helpWhenOff":
    "Hinzufügen erzeugt einen neuen Jitsi-Raum, hängt den Beitritts-Link ans Event und lädt alle Teilnehmer im iCal-Standard ein — wie eine Outlook-/Teams-Termineinladung.",
  "calendar.video.copyLink": "Link kopieren",
  "calendar.sched.title": "Planungs-Assistent",
  "calendar.sched.intro":
    "Vergleicht freie/gebuchte Zeiten mehrerer Personen — klick eine Lücke an, um direkt einen Termin zu erstellen.",
  "calendar.sched.participantsPlaceholder":
    "Personen kommagetrennt (z.B. mara, diana.matushkina@corehub.kineo360.work)",
  "calendar.sched.duration": "Dauer",
  "calendar.sched.from": "von",
  "calendar.sched.to": "bis",
  "calendar.sched.workStartTitle":
    "Arbeitsfenster Start — Vorschläge werden auf dieses Fenster begrenzt.",
  "calendar.sched.workEndTitle": "Arbeitsfenster Ende",
  "calendar.sched.weekendsTitle": "Wochenend-Vorschläge zulassen",
  "calendar.sched.weekendsShort": "Wo-End",
  "calendar.sched.suggestions": "Vorschläge ({count})",
  "calendar.sched.more": "Mehr…",
  "calendar.sched.moreTitle": "Weitere passende Lücken anzeigen",
  "calendar.sched.slotTitle": "Termin {day} {time} eintragen",
  "calendar.sched.noSlot":
    "Kein gemeinsames {minutes}-min-Fenster im Arbeitszeit-Fenster {window}{weekendHint} — Woche wechseln, Dauer kürzen oder Fenster vergrößern.",
  "calendar.sched.weekendIncluded": " (inkl. Wochenende)",
  "calendar.sched.personColumn": "Person",
  "calendar.sched.youFallback": "Du",
  "calendar.sched.minutesShort": "{minutes} min",
  "calendar.sched.selfLive": "du · live",
  "calendar.sched.emptyLanes":
    "Personen oben eingeben, um deren Verfügbarkeit zu sehen.",

  "theme.light": "Hell",
  "theme.dark": "Dunkel",
  "theme.system": "System",

  "mail.folder.inbox": "Posteingang",
  "mail.folder.sent": "Gesendet",
  "mail.folder.drafts": "Entwürfe",
  "mail.folder.spam": "Spam",
  "mail.folder.trash": "Papierkorb",
  "mail.folder.archive": "Archiv",
  "mail.compose": "Neue Mail",
  "mail.compose.to": "An",
  "mail.compose.cc": "Cc",
  "mail.compose.bcc": "Bcc",
  "mail.compose.subject": "Betreff",
  "mail.compose.body": "Nachricht",
  "mail.compose.send": "Senden",
  "mail.compose.saveDraft": "Entwurf speichern",
  "mail.empty.list": "Keine Mails",
  "mail.empty.noSelection": "Wähle eine Mail aus.",
  "mail.markRead": "Als gelesen markieren",
  "mail.markUnread": "Als ungelesen markieren",
  "mail.delete": "In den Papierkorb",
  "mail.moveTo": "Verschieben in …",
  "mail.settings": "Mail-Einstellungen (SnappyMail Admin)",
  "mail.bulk.one": "ausgewählt",
  "mail.bulk.many": "ausgewählt",
  "mail.bulk.visible": "sichtbar",
  "mail.bulk.selectAllVisible": "Alle sichtbare auswählen",
  "mail.bulk.clearSelection": "Auswahl aufheben",
  "mail.bulk.moveToTrash": "In den Papierkorb",
  "mail.bulk.deleteConfirm":
    "Ausgewählte Nachrichten wirklich löschen? (Liegen sie nicht bereits im Papierkorb, verschieben wir sie in den Papierkorb.)",
  "mail.bulk.partialFail":
    "Einige Nachrichten konnten nicht gelöscht werden. Bitte Liste aktualisieren und prüfen.",
  "mail.reloadFolders": "Ordner neu laden",
  "mail.resize.folderRail": "Ordnerleiste verschieben",
  "mail.resize.messageList": "Nachrichtenliste verschieben",
  "mail.mobile.backToList": "Zur Nachrichtenliste",
  "mail.folder.aria": "Ordner",
  "mail.aiTriage.tooltip":
    "KI sortiert die Inbox in Heute / Antworten / Info / Rauschen",
  "mail.aiTriage.button": "AI-Triage",
  "mail.loading.threadList": "Lade Nachrichten …",
  "mail.loading.message": "Lade Nachricht …",
  "mail.empty.threadSearch": "Nichts gefunden",
  "mail.empty.threadList": "Keine Nachrichten",
  "mail.select.messageHint": "Wähle eine Nachricht aus",
  "mail.row.selectAria": "Nachricht auswählen",
  "mail.row.threadBadgeTitle": "Konversation mehrteiliger Nachrichten",
  "mail.triage.urgent": "Heute",
  "mail.triage.needsAction": "Antworten",
  "mail.triage.fyi": "Info",
  "mail.triage.noise": "Rauschen",
  "mail.reader.backToList": "Zur Liste",
  "mail.reader.to": "An:",
  "mail.reader.cc": "Cc:",
  "mail.reader.aiReply": "AI-Antwort",
  "mail.reader.asIssue": "Als Issue",
  "mail.reader.snooze": "Snooze",
  "mail.reader.moreInThread": "Weitere Nachrichten in dieser Konversation",
  "mail.noSubject": "(kein Betreff)",
  "mail.noBody": "(kein Inhalt)",
  "mail.unknownSender": "(unbekannt)",
  "mail.sendFailed": "Senden fehlgeschlagen:",
  "mail.quote.header": "Am {date} schrieb {name}:\n",
  "mail.compose.attachment": "Anhang",
  "mail.compose.aiWithAi": "Mit AI",
  "mail.compose.aiDraftTooltip": "Mit AI Entwurf erstellen",
  "mail.compose.aiDraftIntro":
    "Beschreibe was die Mail erreichen soll — Subject + Body werden generiert.",
  "mail.compose.aiDraftPlaceholder":
    "z.B. „Erstkontakt mit Physio-Praxis, kurze Vorstellung MedTheris und Vorschlag für ein 15-min Demo-Call.“",
  "mail.compose.toneLabel": "Tonalität:",
  "mail.compose.tone.friendly": "Freundlich",
  "mail.compose.tone.formal": "Formell",
  "mail.compose.tone.short": "Kurz",
  "mail.compose.aiDraftButton": "Entwurf erzeugen",
  "mail.compose.recipientsPlaceholder": "empfänger@beispiel.de, …",
  "mail.compose.aiDraftFailed": "AI-Draft fehlgeschlagen:",
  "mail.compose.bodyPlaceholder": "Schreibe deine Nachricht …",
  "mail.snooze.title": "Später erinnern",
  "mail.snooze.intro":
    "Die Mail verschwindet aus deinem Posteingang und kommt zur gewählten Zeit ungelesen zurück.",
  "mail.snooze.customTime": "Eigene Zeit",
  "mail.snooze.submit": "Snoozen",
  "mail.snooze.errorMinFuture": "Bitte mindestens 5 Minuten in die Zukunft.",
  "mail.snooze.errorInvalidDate": "Ungültiges Datum",
  "mail.snooze.preset.inOneHour": "In 1 Stunde",
  "mail.snooze.preset.todayEvening": "Heute Abend",
  "mail.snooze.preset.tomorrowEvening": "Morgen Abend",
  "mail.snooze.preset.tomorrowMorning": "Morgen früh",
  "mail.snooze.preset.nextMonday": "Nächster Montag",
  "mail.issue.dialogTitle": "Als Plane-Issue speichern",
  "mail.issue.successBody": "Issue erstellt — wird dir zugewiesen.",
  "mail.issue.openIssueLink": "#{n} öffnen →",
  "mail.issue.projectLabel": "Projekt",
  "mail.issue.loadingProjects": "Lade Projekte …",
  "mail.issue.noProjects": "Keine Projekte in deinem Plane-Workspace gefunden.",
  "mail.issue.titleLabel": "Titel",
  "mail.issue.priorityLabel": "Priorität",
  "mail.issue.descIntro": "Beschreibung enthält automatisch:",
  "mail.issue.descBullet1": "Absender, Datum, Betreff",
  "mail.issue.descBullet2": "Mail-Inhalt (auf 4000 Zeichen gekürzt)",
  "mail.issue.descBullet3": "Link zurück zur E-Mail",
  "mail.issue.createButton": "Erstellen",
  "mail.issue.html.fromMail": "Aus E-Mail:",
  "mail.issue.html.date": "Datum:",
  "mail.issue.html.subject": "Betreff:",
  "mail.issue.html.openOriginal": "Original-E-Mail im Portal öffnen",
  "mail.aiReply.title": "AI-Antwortvorschläge",
  "mail.aiReply.knowledgeTooltip": "Genutzte Wissensbasis-Abschnitte:",
  "mail.aiReply.knowledgeCountOne": "Wissensbasis: 1 Abschnitt",
  "mail.aiReply.knowledgeCountMany": "Wissensbasis: {n} Abschnitte",
  "mail.aiReply.intentPlaceholder":
    "Optional: was soll die Antwort sagen? z.B. „Termin am Mi 14:00 bestätigen, alternative Donnerstag 09:00“.",
  "mail.aiReply.tone.empathic": "Empathisch",
  "mail.aiReply.generate": "Generieren",
  "mail.aiReply.regenerate": "Neu generieren",
  "mail.aiReply.notConfiguredIntro": "Tipp: Befülle die ",
  "mail.aiReply.knowledgeBase": "Wissensbasis",
  "mail.aiReply.notConfiguredOutro": " damit die AI deine Firma kennt.",
  "mail.aiReply.generating": "Generiere Vorschläge mit Firmen-Wissensbasis …",
  "mail.aiReply.apply": "Übernehmen",
  "mail.aiReply.subjectLabel": "Betreff:",

  "crm.companies": "Firmen",
  "crm.people": "Personen",
  "crm.deals": "Deals",
  "crm.notes": "Notizen",
  "crm.tab.activity": "Aktivität",
  "crm.tab.people": "Personen",
  "crm.tab.deals": "Deals",
  "crm.tab.details": "Details",
  "crm.empty.companies": "Noch keine Firmen. Lege die erste an.",
  "crm.empty.people": "Keine Personen verknüpft.",
  "crm.empty.activity": "Noch keine Aktivität. Lege oben eine Notiz an.",
  "crm.empty.selection":
    "Wähle links eine Firma, um Activity-Feed, Personen, Deals und alle Stammdaten zu sehen.",
  "crm.placeholder.companyName": "Firmenname · Enter zum Anlegen",
  "crm.placeholder.search": "Firma suchen …",
  "crm.scraper": "Lead-Scraper anstoßen",
  "crm.settings": "CRM-Einstellungen (Twenty)",
  "crm.toolbar.pipelineAll": "Pipeline (alle Deals)",
  "crm.toolbar.importCsv": "CSV-Import (Firmen / Personen)",
  "crm.toolbar.newCompany": "Neue Firma",
  "crm.button.company": "Firma",
  "crm.empty.filtered": "Keine Treffer mit diesen Filtern",
  "crm.empty.noCompanySelected": "Keine Firma gewählt",
  "crm.hub.linksTitle": "Verknüpfungen",
  "crm.hub.linksSubtitleWithCompany": "Activity · Personen · Deals · Details",
  "crm.hub.linksSubtitleEmpty": "Wähle eine Firma",
  "crm.twenty.nativeTitle": "Native Twenty-Integration",
  "crm.twenty.createSoonTooltip": "In Twenty anlegen (bald im Portal)",
  "crm.bulk.deleteConfirmOne": "{n} Firma wirklich löschen?",
  "crm.bulk.deleteConfirmMany": "{n} Firmen wirklich löschen?",
  "crm.alert.saveFailed": "Speichern fehlgeschlagen:",
  "crm.alert.deleteFailed": "Löschen fehlgeschlagen:",
  "crm.savedView.promptName": "Name für diese Ansicht:",
  "crm.time.justNow": "gerade",
  "crm.time.minutesShort": "{n} min",
  "crm.time.hoursShort": "{n} h",
  "crm.time.daysShort": "{n} d",
  "crm.mautic.noSegments": "Keine Segmente in Mautic angelegt.",
  "crm.person.noEmail": "Keine E-Mail hinterlegt",
  "crm.activity.empty": "Keine Aktivität",
  "crm.feed.noTitle": "(ohne Titel)",
  "crm.feed.noName": "(ohne Name)",
  "crm.deals.noOpen": "Keine offenen Deals.",
  "crm.stats.lastActivity": "letzte Aktivität {time}",
  "crm.mautic.syncPeopleTitle":
    "Personen von „{company}“ in Mautic anlegen / aktualisieren",
  "crm.delete.confirmNamed": "„{name}“ wirklich löschen?",
  "crm.bulk.deletePartialFail":
    "{failed} von {total} Löschungen schlugen fehl.",
  "crm.alert.createFailed": "Anlegen fehlgeschlagen:",
  "crm.alert.pushFailed": "Push fehlgeschlagen:",
  "crm.savedView.deleteConfirm": "Ansicht „{name}“ löschen?",
  "crm.loadMore": "Mehr laden…",
  "crm.twenty.hint":
    "Für Pipelines, Custom Views und Bulk-Edit öffne den vollen Twenty-Workspace im neuen Tab.",
  "crm.stats.noActivityShort": "keine Aktivität",
  "crm.savedView.applyTitle": "Ansicht anwenden",
  "crm.filter.reset": "Zurücksetzen",
  "crm.openInTwenty": "In Twenty öffnen",
  "crm.tooltip.closeFilter": "Filter schließen",
  "crm.tooltip.deleteView": "Ansicht löschen",
  "crm.selection.clear": "Auswahl aufheben",
  "crm.selection.selectAllVisible": "Alle sichtbaren auswählen",
  "crm.selection.count": "{count} ausgewählt",
  "crm.bulk.setLeadSource": "Lead-Quelle für Auswahl setzen",
  "crm.bulk.setOwner": "Inhaber:in für Auswahl setzen",
  "crm.bulk.deleteSelection": "Auswahl löschen",
  "crm.button.delete": "Löschen",
  "crm.push.skippedNoEmail": "{count} übersprungen (keine E-Mail)",
  "crm.modal.close": "Schließen",
  "crm.segment.pickTitle": "Segment wählen",
  "crm.segment.select": "Segment auswählen",
  "crm.segment.clickOutsideHint":
    "Tipp: Klick außerhalb der Liste = abbrechen",
  "crm.selection.removeRow": "Auswahl entfernen",
  "crm.selection.addRow": "Auswählen",
  "crm.saveChanges": "Änderungen speichern",
  "crm.hub.crossAppTitle":
    "Cross-App Übersicht · Mail, Tickets, Files, Projekte",
  "crm.section.keyContacts": "Schlüsselkontakte",
  "crm.changedAt": "Geändert {datetime}",
  "crm.sync.summary":
    "{synced} synchronisiert, {skipped} übersprungen",
  "crm.sync.errorsSuffix": ", {errors} Fehler",
  "crm.openInMautic": "In Mautic öffnen",
  "crm.claude.heading": "Claude-Einschätzung",
  "crm.channel.pickAgain":
    "Kanal wählen und nochmal auf „Pitch-Text\" klicken oder",
  "crm.label.add": "Hinzufügen:",
  "crm.calls.linkedTitle": "Wird mit Calls-UI verknüpft",
  "crm.notes.placeholder": "Inhalt (Markdown unterstützt)",
  "crm.modal.closeShort": "Schließen",
  "crm.scraper.runningSince": "Läuft seit",
  "crm.scraper.triggerIntro":
    "Trigger startet einen einzelnen Scraper-Lauf für die angegebene Stadt.",
  "crm.scraper.fullPanelTitle": "Vollständiges Scraper-Panel",
  "crm.scraper.running": "Läuft…",
  "crm.scraper.runningShort": "läuft",
  "crm.scraper.startingButton": "Startet…",
  "crm.scraper.triggerRun": "Lauf starten",
  "crm.scraper.lastRunOkPrefix": "Letzter Lauf ok · ",
  "crm.scraper.lastRunExitPrefix": "Letzter Lauf: exit ",
  "crm.scraper.advancedShort": "Erweitert",
  "crm.scraper.errorBadge": "Fehler",
  "crm.scraper.offlineBadge": "offline",
  "crm.scraper.okBadge": "ok",
  "crm.scraper.dryRunCheckbox": "Dry-Run (kein CRM-Push)",
  "crm.scraper.cantonOptionalLabel": "Kanton (optional)",
  "crm.scraper.cantonPlaceholder": "z.B. BS",
  "crm.scraper.limitLabel": "Limit",
  "crm.savedViews.heading": "Gespeicherte Ansichten",
  "crm.savedView.saveAsNewTitle":
    "Aktuelle Filter als neue Ansicht speichern",
  "crm.filter.phone": "Telefon",
  "crm.filter.emailField": "E-Mail",
  "crm.filter.owner": "Inhaber",
  "crm.filter.booking": "Booking",
  "crm.filter.leadSourceFacet": "Lead-Quelle",
  "crm.filter.cityFacet": "Stadt",
  "crm.triState.any": "Beliebig",
  "crm.triState.yes": "Ja",
  "crm.triState.no": "Fehlt",
  "crm.facet.less": "weniger",
  "crm.facet.more": "+{count} mehr",
  "crm.selection.visibleTotal": "{n} sichtbar",
  "crm.push.titleUpsertNoSegment":
    "Auswahl in Mautic upserten (ohne Segment-Bindung)",
  "crm.push.buttonInFunnel": "In Funnel",
  "crm.segment.loading": "Lade Segmente…",
  "crm.push.resultPushed": "{pushed} an Mautic gepusht",
  "crm.push.resultToSegment": " → „{name}“",
  "crm.push.resultErrors": "{errors} Fehler",
  "crm.bulk.placeholderLeadSource": "Lead-Quelle …",
  "crm.bulk.placeholderOwner": "Inhaber:in …",
  "crm.bulk.leadSourceShort": "Lead-Quelle",
  "crm.bulk.ownerShort": "Inhaber:in",
  "crm.leadScore.title": "Lead-Score: {score} — {desc}",
  "crm.leadScore.desc.hot": "heiß — direkt in den Funnel",
  "crm.leadScore.desc.warm": "warm — Triage lohnt",
  "crm.leadScore.desc.cold": "kalt — Datenpflege oder Auto-Enrichment",
  "crm.activityTone.fresh": "Aktiv (< 7 Tage)",
  "crm.activityTone.warm": "Warm (< 30 Tage)",
  "crm.activityTone.stale": "Kalt (> 30 Tage)",
  "crm.person.placeholder.name": "Name",
  "crm.person.placeholder.phone": "Telefon",
  "crm.person.placeholder.emailGeneral": "Allgemeine E-Mail",
  "crm.company.unnamed": "(ohne Name)",
  "crm.nav.backToCrm": "Zurück zum CRM",
  "crm.companyHub.tagline":
    "Company-Hub · Querschnitt Mail, Tickets, Files, Sign, Projekte",
  "crm.companyHub.phoneShort": "Tel.",
  "crm.companyHub.quickLinksHeading": "Schnellzugriff",
  "crm.companyHub.tileCrmTitle": "CRM · Detail",
  "crm.companyHub.tileCrmDesc":
    "Gleiche Firma im dreispaltigen CRM öffnen.",
  "crm.companyHub.tileMailDescCompose":
    "Entwurf im Portal mit der hinterlegten Adresse starten.",
  "crm.companyHub.tileMailDescDomain":
    "Liste filtern nach „@{domain}“ (nach dem Öffnen aktiv).",
  "crm.companyHub.tileMailDescInbox":
    "Postfach öffnen — Suchfeld manuell nutzen.",
  "crm.companyHub.tileHelpdeskDesc":
    "Tickets mit Suchwort (Firmenname) laden — genauer in der Ticketliste.",
  "crm.companyHub.tileFilesDescSearch": "Vollsuche mit „{hint}“.",
  "crm.companyHub.tileFilesDescManual": "Cloud öffnen — Suche manuell.",
  "crm.companyHub.tileOfficeDesc":
    "Vorlagen & Texte bearbeiten; PDF aus Office exportieren und zu Sign bringen.",
  "crm.companyHub.tileSignTitle": "Unterschrift (Sign)",
  "crm.companyHub.tileSignDesc":
    "PDF hochladen oder aus Office bringen — Verknüpfung mit dieser Firma für Nachvollziehbarkeit.",
  "crm.companyHub.tileTwentyTitle": "Twenty (CRM Roh)",
  "crm.companyHub.tileTwentyDesc": "Native Twenty-Oberfläche.",
  "crm.pipeline.title": "Deal-Pipeline",
  "crm.pipeline.subtitle":
    "{workspace} · alle Opportunities · per Drag & Drop Stage wechseln",
  "crm.pipeline.searchPlaceholder": "Deal- oder Firmenname…",
  "crm.pipeline.loading": "Pipeline wird geladen…",
  "crm.opportunity.alertDropUnset":
    "In „Ohne Stage“ kann nichts gezogen werden — wähle eine echte Stage.",
  "crm.opportunity.dragToChangeStage": "Ziehen, um die Stage zu ändern.",
  "crm.opportunity.openInFullCrm": "Im CRM öffnen",
  "crm.opportunity.dropHere": "hier reinziehen",
  "crm.opportunity.stageUnset": "Ohne Stage",
  "crm.opportunity.emptyBoard": "Keine Deals.",
  "crm.attribution.heading": "Kampagnen-Attribution (UTM)",
  "crm.attribution.subheading":
    "Welle 3 — first / last touch unter /data/marketing-attribution.json",
  "crm.attribution.loading": "Lade…",
  "crm.attribution.empty":
    "Noch keine gespeicherten UTM-Daten für diese Firma. Über POST /api/marketing/attribution (CRM-Session) oder später eingebettete Lead-Forms / Landing-Pages.",
  "crm.attribution.firstTouch": "Erstkontakt",
  "crm.attribution.lastTouch": "Letzter Kontakt",
  "crm.settingsPage.title": "CRM-Einstellungen",
  "crm.settingsPage.subtitle":
    "{workspace} · Twenty-Tenant, Mitglieder & Pipeline",
  "crm.settingsPage.intro":
    "Übersicht der Twenty-Tenant-Konfiguration für {workspace}. Bearbeitung von Custom-Feldern, Pipelines und Integrationen erfolgt aktuell direkt in Twenty (Buttons unten öffnen den jeweiligen Bereich in einem neuen Tab).",
  "crm.settingsPage.loadFailed": "Konnte Einstellungen nicht laden",
  "crm.settingsPage.sectionApi": "API-Verbindung",
  "crm.settingsPage.linkApiKeysTwenty": "API-Keys in Twenty",
  "crm.settingsPage.apiReachable": "erreichbar",
  "crm.settingsPage.apiUnreachable": "nicht erreichbar",
  "crm.settingsPage.labelTwentyWorkspaceId": "Twenty-Workspace-ID",
  "crm.settingsPage.labelPublicUrl": "Public-URL",
  "crm.settingsPage.labelComposeUrl": "Compose-URL",
  "crm.settingsPage.kpiPipelineStages": "Pipeline-Stages",
  "crm.settingsPage.sectionMembers": "Workspace-Mitglieder",
  "crm.settingsPage.linkEditInTwenty": "in Twenty bearbeiten",
  "crm.settingsPage.membersEmpty":
    "Keine Mitglieder gefunden – API-Token könnte zu eng eingeschränkt sein, oder im Workspace ist nur der Bridge-User aktiv.",
  "crm.settingsPage.sectionPipeline": "Pipeline (Deals nach Stage)",
  "crm.settingsPage.linkDataModel": "Datenmodell",
  "crm.settingsPage.pipelineIntroPrefix":
    "Stages mit Sales abstimmen, bevor ihr ein großes Kanban baut (siehe Playbook ",
  "crm.settingsPage.pipelineIntroSuffix":
    "). Die Darstellung unten spiegelt nur bestehende Deals wider.",
  "crm.settingsPage.pipelineEmpty":
    "Noch keine Deals erfasst. Lege im CRM die Pipeline-Stages an und bewege Opportunities zwischen ihnen.",
  "crm.settingsPage.sectionLeadSources": "Lead-Quellen",
  "crm.settingsPage.leadSourcesEmpty": "Keine Lead-Quellen erfasst.",
  "crm.settingsPage.sectionIntegrations": "Integrationen",
  "crm.settingsPage.integrationMauticTitle": "Marketing (Mautic)",
  "crm.settingsPage.integrationMauticSubtitle":
    "Bridge-Token, Segmente, Kampagnen",
  "crm.settingsPage.integrationTwentyTitle": "Twenty-Integrationen",
  "crm.settingsPage.integrationTwentySubtitle":
    "Webhooks, API-Keys, externe Datenquellen",
  "crm.importCsvModal.title": "CSV-Import",
  "crm.importCsvModal.subtitleCompanies":
    "Firmen aus CSV in Twenty CRM importieren",
  "crm.importCsvModal.subtitlePeople":
    "Personen / Kontakte aus CSV in Twenty CRM importieren — duplikatfreie Übernahme via E-Mail",
  "crm.importCsvModal.entityPeople": "Personen",
  "crm.importCsvModal.entityCompanies": "Firmen",
  "crm.importCsvModal.formatHint":
    "Tipp: HubSpot/Pipedrive/Excel-Spalten werden automatisch erkannt.",
  "crm.importCsvModal.uploadCsv": "CSV hochladen",
  "crm.importCsvModal.previewBusy": "Vorschau wird erzeugt …",
  "crm.importCsvModal.totalsRows": "Zeilen",
  "crm.importCsvModal.totalsValid": "gültig",
  "crm.importCsvModal.totalsSkipped": "übersprungen",
  "crm.importCsvModal.sepComma": "Komma (,)",
  "crm.importCsvModal.sepSemicolon": "Semikolon (;)",
  "crm.importCsvModal.sepTab": "Tab",
  "crm.importCsvModal.autoCreateCompanies": "Fehlende Firmen automatisch anlegen",
  "crm.importCsvModal.mappingHeading": "Spalten-Mapping",
  "crm.importCsvModal.columnEmpty": "(leer)",
  "crm.importCsvModal.thNum": "#",
  "crm.importCsvModal.thCompanyName": "Name",
  "crm.importCsvModal.thDomain": "Domain",
  "crm.importCsvModal.thCity": "Stadt",
  "crm.importCsvModal.thIndustry": "Branche",
  "crm.importCsvModal.thPersonName": "Vor- / Nachname",
  "crm.importCsvModal.thEmail": "E-Mail",
  "crm.importCsvModal.thCompany": "Firma",
  "crm.importCsvModal.thJobTitle": "Position",
  "crm.importCsvModal.thStatus": "Status",
  "crm.importCsvModal.resultCompaniesSuffix": "Firmen angelegt.",
  "crm.importCsvModal.resultPeopleSuffix": "Personen angelegt.",
  "crm.importCsvModal.skippedSummary":
    "{count} übersprungen (z. B. existierende E-Mail).",
  "crm.importCsvModal.errorsSummary":
    "{count} fehlgeschlagen — Details:",
  "crm.importCsvModal.errorsRowPrefix": "Zeile",
  "crm.importCsvModal.footerReady": "{count} gültige Zeilen bereit",
  "crm.importCsvModal.footerPrompt": "CSV einfügen oder hochladen",
  "crm.importCsvModal.runCount": "{count} importieren",
  "crm.importCsvModal.running": "Importiere …",
  "crm.importCsvModal.delimiterDetected": "Trenner:",
  "crm.importCsvModal.field.ignore": "Ignorieren",
  "crm.importCsvModal.field.companyName": "Name",
  "crm.importCsvModal.field.domainName": "Domain",
  "crm.importCsvModal.field.industry": "Branche",
  "crm.importCsvModal.field.phone": "Telefon",
  "crm.importCsvModal.field.address": "Adresse",
  "crm.importCsvModal.field.city": "Stadt",
  "crm.importCsvModal.field.country": "Land",
  "crm.importCsvModal.field.arr": "Umsatz (ARR)",
  "crm.importCsvModal.field.employees": "Mitarbeiter",
  "crm.importCsvModal.field.linkedinUrl": "LinkedIn",
  "crm.importCsvModal.field.xUrl": "Twitter / X",
  "crm.importCsvModal.field.notes": "Notizen",
  "crm.importCsvModal.field.firstName": "Vorname",
  "crm.importCsvModal.field.lastName": "Nachname",
  "crm.importCsvModal.field.fullName": "Voller Name",
  "crm.importCsvModal.field.email": "E-Mail",
  "crm.importCsvModal.field.jobTitle": "Position",
  "crm.importCsvModal.field.company": "Firma",
  "crm.mautic.badgeDetailed":
    "Mautic @{domain}: {count} Kontakt(e). Segmente: {segments}. Stage: {stage}",
  "crm.mautic.badgeSimpleOne": "In Mautic: 1 Kontakt @{domain}",
  "crm.mautic.badgeSimpleMany": "In Mautic: {hits} Kontakte @{domain}",
  "crm.quick.call": "Anrufen",
  "crm.quick.videoCall": "Video-Call",
  "crm.quick.mail": "Mail",
  "crm.quick.note": "Notiz",
  "crm.quick.task": "Aufgabe",
  "crm.quick.companyHub": "Company Hub",
  "crm.quick.mailToPortal": "Mail an {email} (im Portal)",
  "crm.call.subjectWithCompany": "Call mit {name}",
  "crm.quick.callNumber": "Anrufen {phone}",
  "crm.quick.mailTo": "Mail an {email}",
  "crm.icp.label": "Ideal Customer",
  "crm.section.contact": "Kontakt",
  "crm.section.classification": "Klassifizierung",
  "crm.section.timeline": "Zeitleiste",
  "crm.people.leadTherapistSection": "Lead-Therapeut",
  "crm.people.therapistsColumn": "Therapeut:innen",
  "crm.people.keyStaffTitle": "Therapeut:innen / Mitarbeitende",
  "crm.notes.titlePlaceholder": "Titel der Notiz",
  "crm.ai.classifyFailedHeading": "Klassifizierung fehlgeschlagen",
  "crm.timeline.created": "Erstellt {datetime}",
  "crm.timeline.updated": "Geändert {datetime}",
  "crm.field.ownerMail": "Inhaber-Mail",
  "crm.field.icp": "ICP",
  "crm.field.tenant": "Tenant",
  "crm.marketing.loadingData": "Lade Mautic-Daten…",
  "crm.marketing.apiNotConfigured": "Mautic ist nicht konfiguriert.",
  "crm.marketing.credentialsMissing": "(MAUTIC_API_USERNAME/_TOKEN fehlen)",
  "crm.marketing.contactsLine": "Mautic-Kontakte{suffix}",
  "crm.marketing.segmentTooltip": "{count} Kontakt(e) in „{name}“",
  "crm.marketing.pointsAbbrev": "{n} Pkt.",
  "crm.sidebar.marketing": "Marketing",
  "crm.ai.leadButton": "AI-Lead",
  "crm.ai.classifyTooltip": "AI-Klassifizieren (Claude)",
  "crm.ai.nextStepLabel": "Next-Step",
  "crm.ai.salesBriefTooltip":
    "AI-Sales-Brief erstellen (Website + News + Workspace-Knowledge)",
  "crm.ai.salesBriefModalHeading": "AI-Sales-Brief",
  "crm.ai.salesBriefButton": "Sales-Brief",
  "crm.ai.briefFailedHeading": "Brief fehlgeschlagen",
  "crm.ai.websiteOkBadge": "Website OK",
  "crm.ai.knowledgeBadge": "Knowledge",
  "crm.ai.copyToClipboard": "In Zwischenablage",
  "crm.ai.copied": "✓ kopiert",
  "crm.ai.regenerate": "Neu generieren",
  "crm.ai.pitchTooltip":
    "AI: Pitch-Text passend zum Kanal (E-Mail · LinkedIn · …)",
  "crm.ai.pitchButton": "Pitch-Text",
  "crm.ai.channelLabel": "Kanal",
  "crm.ai.pitchEmptyHint":
    "Kanal wählen und nochmal auf „Pitch-Text“ klicken oder „Neu generieren“ nutzen.",
  "crm.pitch.cold_email": "Erst-Mail",
  "crm.pitch.linkedin": "LinkedIn",
  "crm.pitch.followup": "Nachfass",
  "crm.pitch.call_opener": "Anruf",
  "crm.scraper.launcherHeading": "Lead-Scraper",
  "crm.stat.openDeals": "Offene Deals",
  "crm.stat.contacts": "Kontakte",
  "crm.stat.lastContact": "Letzter Kontakt",
  "crm.stat.openTasks": "Offene Tasks",
  "crm.stat.tasksFromTotal": "von {total}",
  "crm.stat.tasksAllDone": "Alles erledigt",
  "crm.inlineEdit.saveTooltip": "Änderungen speichern",
  "crm.inlineEdit.editFieldsTooltip": "Name · Telefon · E-Mail bearbeiten",
  "crm.section.activeDeals": "Aktive Deals",
  "crm.details.practiceSection": "Praxis-Stammdaten",
  "crm.details.addressSection": "Adresse",
  "crm.field.specialization": "Spezialisierung",
  "crm.field.languages": "Sprachen",
  "crm.field.street": "Strasse",
  "crm.field.zipCity": "PLZ / Ort",
  "crm.field.country": "Land",
  "crm.field.leadName": "Name",

  "helpdesk.tickets": "Tickets",
  "helpdesk.scope.all": "Alle",
  "helpdesk.scope.mine": "Meine",
  "helpdesk.scope.unassigned": "Nicht zugewiesen",
  "helpdesk.filter.open": "Offen",
  "helpdesk.filter.closed": "Geschlossen",
  "helpdesk.filter.all": "Alle",
  "helpdesk.status.new": "Neu",
  "helpdesk.status.open": "Offen",
  "helpdesk.status.pending": "Wartend",
  "helpdesk.status.closed": "Geschlossen",
  "helpdesk.status.merged": "Zusammengeführt",
  "helpdesk.priority.low": "Niedrig",
  "helpdesk.priority.normal": "Normal",
  "helpdesk.priority.high": "Hoch",
  "helpdesk.priority.urgent": "Dringend",
  "helpdesk.empty.mine": "Keine Tickets für dich.",
  "helpdesk.empty.allAssigned": "Alles zugewiesen.",
  "helpdesk.empty.open": "Keine offenen Tickets.",
  "helpdesk.empty.generic": "Keine Tickets.",
  "helpdesk.newTicket": "Neues Ticket",
  "helpdesk.reply": "Antworten",
  "helpdesk.internalNote": "Interne Notiz",
  "helpdesk.assignee": "Bearbeiter",
  "helpdesk.group": "Gruppe",
  "helpdesk.settings": "Einstellungen (Gruppen, Absender, Kanäle)",
  "helpdesk.slaRisk": "SLA-Risiko",
  "helpdesk.slaRisk.title":
    "Nur Tickets mit SLA unter 60 Minuten oder überfällig anzeigen",
  "helpdesk.stats.open": "Offen",
  "helpdesk.stats.slaAtRisk": "SLA-Risiko",
  "helpdesk.stats.closedToday": "Heute geschlossen",
  "helpdesk.stats.capped": "nur Teilmenge — siehe Zammad bei sehr großen Queues",
  "helpdesk.composer.answerTab": "Antwort",
  "helpdesk.composer.internalTab": "Interne Notiz",
  "helpdesk.composer.sendShortcut": "⌘/Ctrl + Enter zum Senden",
  "helpdesk.composer.solutionLabel": "Interne Lösung / Abschluss (optional, nur für die Akte)",
  "helpdesk.composer.solutionPlaceholder":
    "Kurz festhalten, was geklärt wurde — wird als interne Notiz gespeichert.",
  "helpdesk.composer.placeholderReply": "Antwort an Kunde…",
  "helpdesk.composer.placeholderNote": "Interne Notiz — Kunde sieht das nicht.",
  "helpdesk.composer.statusAfterSend": "Status nach Senden",
  "helpdesk.composer.saveNote": "Notiz speichern",
  "helpdesk.customer.crm": "CRM",
  "helpdesk.customer.crmTitle": "Person in Twenty CRM öffnen",
  "helpdesk.channel.email": "E-Mail",
  "helpdesk.channel.phone": "Telefon",
  "helpdesk.channel.web": "Web / Portal",
  "helpdesk.channel.note": "Notiz",
  "helpdesk.channel.sms": "SMS",
  "helpdesk.channel.chat": "Chat",
  "helpdesk.channel.twitter": "Twitter / X",
  "helpdesk.channel.facebook": "Facebook",
  "helpdesk.channel.other": "Kanal",
  "helpdesk.import.csvTitle": "Tickets aus CSV importieren",
  "helpdesk.conversation.title": "Konversation",
  "helpdesk.conversation.pickTicket": "Wähle ein Ticket",
  "helpdesk.portalLink.mintTitle":
    "Signierten Magic-Link für den Kunden erstellen und in die Zwischenablage kopieren.",
  "helpdesk.portalLink.button": "Magic-Link",
  "helpdesk.portalLink.copied": "Kopiert",
  "helpdesk.portalLink.prompt": "Magic-Link kopieren:",
  "helpdesk.portalLink.manualCopied": "Magic-Link erstellt (manuell kopieren).",
  "helpdesk.portalLink.copiedToast": "Magic-Link kopiert (gültig 30 Tage).",
  "helpdesk.empty.noTicket": "Kein Ticket gewählt",
  "helpdesk.empty.noTicketHint":
    "Wähle links ein Ticket, um Verlauf und Antwort-Composer zu sehen.",
  "helpdesk.empty.noMessages": "Keine Nachrichten.",
  "helpdesk.empty.zammadTitle": "Native Zammad-Integration",
  "helpdesk.empty.zammadHint":
    "Tickets bearbeiten, antworten, intern notieren — direkt im Portal.",
  "helpdesk.error.loadTicket": "Ticket laden fehlgeschlagen",
  "helpdesk.error.createTicket": "Anlegen fehlgeschlagen",
  "helpdesk.error.save": "Speichern fehlgeschlagen",
  "helpdesk.error.send": "Senden fehlgeschlagen",
  "helpdesk.error.tagAdd": "Tag hinzufügen fehlgeschlagen",
  "helpdesk.error.tagRemove": "Tag entfernen fehlgeschlagen",
  "helpdesk.error.portalLink": "Magic-Link fehlgeschlagen",
  "helpdesk.error.macro": "Macro fehlgeschlagen",
  "helpdesk.error.bulk": "Bulk-Update fehlgeschlagen",
  "helpdesk.bulk.partialFail": "konnten nicht aktualisiert werden",
  "helpdesk.card.mine": "Mir",
  "helpdesk.card.selectBulk": "Auswählen für Bulk-Aktionen",
  "helpdesk.card.noTitle": "(ohne Titel)",
  "helpdesk.card.unread": "Ungelesen",
  "helpdesk.crm.twentyLabel": "Twenty CRM",
  "helpdesk.newTicket.subjectPh": "Betreff…",
  "helpdesk.newTicket.bodyPh": "Beschreibung (optional)",
  "helpdesk.newTicket.cancel": "Abbrechen",
  "helpdesk.newTicket.submit": "Anlegen",
  "helpdesk.composer.templates": "Vorlagen",
  "helpdesk.composer.templatesTitle": "Vorlagen einsetzen",
  "helpdesk.composer.attachmentSoon": "Anhang (bald verfügbar)",
  "helpdesk.composer.attachment": "Anhang",
  "helpdesk.customer.videoCall": "Video-Call",
  "helpdesk.customer.mailAction": "Mail",
  "helpdesk.customer.profile360": "360°",
  "helpdesk.customer.profileTitle": "Kundenprofil öffnen (Customer 360°)",
  "helpdesk.customer.unknown": "Unbekannter Kontakt",
  "helpdesk.article.agent": "Agent",
  "helpdesk.sla.firstResponse": "First Response",
  "helpdesk.sla.closeDeadline": "Close",
  "helpdesk.sla.breached": "SLA verletzt",
  "helpdesk.sla.pill": "SLA",
  "helpdesk.sla.due": "fällig:",
  "helpdesk.sla.panel.first": "Erstantwort",
  "helpdesk.sla.panel.close": "Lösung",
  "helpdesk.sla.panel.none": "Kein SLA aktiv.",
  "helpdesk.time.justNow": "gerade",
  "helpdesk.time.mins": "Min.",
  "helpdesk.time.hours": "Std.",
  "helpdesk.time.days": "Tg.",
  "helpdesk.drawer.ticketsTotal": "Tickets gesamt",
  "helpdesk.drawer.customerSince": "Kunde seit",
  "helpdesk.drawer.history": "Ticketverlauf",
  "helpdesk.drawer.noTickets": "Keine Tickets.",
  "helpdesk.drawer.writeEmail": "E-Mail schreiben",
  "helpdesk.drawer.title": "Kundenprofil",
  "helpdesk.drawer.close": "Schließen (Esc)",
  "helpdesk.conversation.articlesCount": "#{number} · {count} Beiträge",
  "helpdesk.sidebar.statusAssignment": "Status & Zuordnung",
  "helpdesk.detail.customerInternalNoteHeading": "Interne Notiz zur Kundenkarte",
  "helpdesk.detail.historyTickets": "Verlauf · {count} Tickets",
  "helpdesk.detail.createdAt": "Erstellt {datetime}",
  "helpdesk.detail.updatedAt": "Geändert {datetime}",
  "helpdesk.detail.lastContactAt": "Letzter Kontakt {datetime}",
  "helpdesk.header.shortcutsTooltip": "Tastenkürzel anzeigen (?)",
  "helpdesk.header.shortcutsLabel": "Shortcuts",
  "helpdesk.openInZammad": "In Zammad öffnen",
  "helpdesk.ai.tooltipWithKb": "AI-Antwortvorschläge mit Firmen-Wissensbasis",
  "helpdesk.ai.tooltipReplyOnly":
    "Kein Kunden-Beitrag — AI-Antwort nur im Antwort-Tab",
  "helpdesk.ai.replyToggle": "AI-Antwort",
  "helpdesk.ai.closeAria": "Schließen",
  "helpdesk.bulk.selectedCount": "{count} ausgewählt",
  "helpdesk.bulk.selectAllVisible": "Alle ({total}) auswählen",
  "helpdesk.bulk.clearSelection": "Auswahl löschen",
  "helpdesk.bulk.optionStatus": "Status…",
  "helpdesk.bulk.optionPriority": "Priorität…",
  "helpdesk.bulk.optionGroup": "Gruppe…",
  "helpdesk.bulk.optionAssignee": "Bearbeiter…",
  "helpdesk.bulk.unassign": "— unzuweisen —",
  "helpdesk.bulk.apply": "Anwenden",
  "helpdesk.field.assignee": "Bearbeiter",
  "helpdesk.macro.menuTitle": "Macro anwenden",
  "helpdesk.macro.setsPrefix": "Setzt:",
  "helpdesk.filter.viewsLabel": "Ansichten:",
  "helpdesk.filter.zammadViewTitle": "Zammad-Ansicht: {name}",
  "helpdesk.filter.moreCount": "+{count} weitere",
  "helpdesk.filter.less": "weniger",
  "helpdesk.tags.add": "Tag hinzufügen",
  "helpdesk.tags.remove": "Tag entfernen",
  "helpdesk.composer.solutionHtmlHeading": "Lösung / Abschluss (intern)",
  "helpdesk.canned.title": "Antwort-Vorlagen",
  "helpdesk.canned.browserOnly": "(lokal, nur in diesem Browser)",
  "helpdesk.canned.new": "Neue Vorlage",
  "helpdesk.canned.none": "Keine Vorlagen.",
  "helpdesk.canned.namePlaceholder": "z.B. „Begrüßung Standard“",
  "helpdesk.canned.bodyPlaceholder": "Hallo {{customer.firstname}}, …",
  "helpdesk.canned.placeholderHint":
    "Tipp: Platzhalter wie {{customer.firstname}} werden später vom Trigger ersetzt — aktuell statisch eingefügt.",
  "helpdesk.canned.pickPrompt":
    "Wähle links eine Vorlage zum Bearbeiten oder lege eine neue an.",
  "helpdesk.shortcuts.title": "Tastenkürzel",
  "helpdesk.shortcuts.focusSearch": "Suche fokussieren",
  "helpdesk.shortcuts.nextPrev": "Nächstes / vorheriges Ticket",
  "helpdesk.shortcuts.newTicket": "Neues Ticket",
  "helpdesk.shortcuts.replyComposer": "Auf Ticket antworten (Composer)",
  "helpdesk.shortcuts.assignMe": "Mir zuweisen",
  "helpdesk.shortcuts.bulkMark": "Aktuelles Ticket für Bulk markieren",
  "helpdesk.shortcuts.toggleOverlay": "Diese Übersicht ein-/ausblenden",
  "helpdesk.shortcuts.closeOverlay": "Drawer / Overlay schließen",
  "helpdesk.shortcuts.sendReply": "Antwort senden",

  "helpdesk.settings.backTitle": "Zurück zum Helpdesk",
  "helpdesk.settings.title": "Helpdesk-Einstellungen",
  "helpdesk.settings.subtitle": "{workspace} · Gruppen, Absender und E-Mail-Kanäle",
  "helpdesk.settings.loadError": "Konnte Einstellungen nicht laden",
  "helpdesk.settings.introBefore": "Konfiguration für",
  "helpdesk.settings.introAfter":
    ". Gruppen, Mitglieder, Absender-Adressen und E-Mail-Kanäle (IMAP/SMTP) werden direkt hier verwaltet — die Aktionen schreiben live in den Helpdesk-Kern zurück. Verbindungs-Tests vor dem Speichern verhindern fehlerhafte Postfach-Konfiguration.",
  "helpdesk.settings.groupsTitle": "Gruppen",
  "helpdesk.settings.groupsEmptyBefore":
    "Für diesen Workspace sind keine Gruppen konfiguriert. Lege sie im Zammad-Admin an und ergänze sie unter",
  "helpdesk.settings.groupsEmptyAfter": "in der `.env`.",
  "helpdesk.settings.emailsTitle": "Absender-Adressen",
  "helpdesk.settings.emailsAdd": "Adresse hinzufügen",
  "helpdesk.settings.emailsEmpty":
    "Keine Absender-Adressen konfiguriert. Lege oben eine Adresse an, um Tickets von dieser Adresse aus beantworten zu können.",
  "helpdesk.settings.channelsTitle": "E-Mail-Kanäle (Inbox / Outbound)",
  "helpdesk.settings.channelsAdd": "Kanal hinzufügen",
  "helpdesk.settings.channelsNeedGroup": "Mindestens eine Gruppe erforderlich",
  "helpdesk.settings.channelsNewHint": "Neuen IMAP/SMTP-Kanal einrichten",
  "helpdesk.settings.channelsEmpty":
    "Keine E-Mail-Kanäle eingerichtet. Klick „Kanal hinzufügen“ oben, um IMAP/SMTP-Zugang einzurichten.",
  "helpdesk.settings.tenantTitle": "Tenant-Konfiguration",
  "helpdesk.settings.tenantWorkspace": "Workspace",
  "helpdesk.settings.tenantGroups": "Erlaubte Zammad-Gruppen",
  "helpdesk.settings.tenantEnvHint": "Konfiguriert via",
  "helpdesk.settings.tenantEnvSuffix": "in der `.env` auf dem Server.",
  "helpdesk.settings.channelDeleteConfirm":
    "Kanal {id} wirklich löschen? Eingehende Mails werden nicht mehr abgeholt.",
  "helpdesk.settings.emailDeleteConfirm":
    "Absender-Adresse „{email}“ wirklich löschen? Tickets behalten ihre Historie, aber neue Mails können von dieser Adresse nicht mehr versendet werden.",
  "helpdesk.settings.channelId": "Kanal {id}",
  "helpdesk.settings.active": "aktiv",
  "helpdesk.settings.inactive": "inaktiv",
  "helpdesk.settings.edit": "Bearbeiten",
  "helpdesk.settings.activate": "Aktivieren",
  "helpdesk.settings.deactivate": "Deaktivieren",
  "helpdesk.settings.pause": "Pausieren",
  "helpdesk.settings.delete": "Löschen",
  "helpdesk.settings.inboundShort": "Inbound (IMAP/POP3)",
  "helpdesk.settings.outboundShort": "Outbound (SMTP)",
  "helpdesk.settings.notConfigured": "nicht konfiguriert",
  "helpdesk.settings.noFields": "— keine Felder —",
  "helpdesk.settings.protocol": "Protokoll",
  "helpdesk.settings.encryption": "Verschlüsselung",
  "helpdesk.settings.ssl993": "SSL/TLS (993)",
  "helpdesk.settings.starttls143": "STARTTLS (143)",
  "helpdesk.settings.encryptionNone": "Keine",
  "helpdesk.settings.host": "Host",
  "helpdesk.settings.port": "Port",
  "helpdesk.settings.user": "Benutzer",
  "helpdesk.settings.password": "Passwort",
  "helpdesk.settings.folder": "Ordner",
  "helpdesk.settings.behavior": "Verhalten",
  "helpdesk.settings.keepOnServer": "Mails auf Server behalten",
  "helpdesk.settings.outboundSection": "Outbound (Postausgang)",
  "helpdesk.settings.smtpExternal": "SMTP (extern)",
  "helpdesk.settings.sendmailLocal": "Sendmail (lokal)",
  "helpdesk.settings.starttls587": "STARTTLS (587)",
  "helpdesk.settings.ssl465": "SSL/TLS (465)",
  "helpdesk.settings.inboundSection": "Inbound (Posteingang)",
  "helpdesk.settings.senderBlock": "Absender-Adresse (wird auch als Sender angelegt)",
  "helpdesk.settings.displayName": "Anzeigename",
  "helpdesk.settings.memberCountOne": "{n} Mitglied",
  "helpdesk.settings.memberCountMany": "{n} Mitglieder",
  "helpdesk.settings.defaultSender": "Default Absender:",
  "helpdesk.settings.groupDefaultMailbox": "Default Absender",
  "helpdesk.settings.noteLabel": "Notiz:",
  "helpdesk.settings.noneOption": "— keiner —",
  "helpdesk.settings.status": "Status",
  "helpdesk.settings.groupActiveLabel": "Gruppe aktiv (eingehende Tickets möglich)",
  "helpdesk.settings.noteField": "Notiz",
  "helpdesk.settings.notePlaceholder": "Interne Beschreibung der Gruppe",
  "helpdesk.settings.members": "Mitglieder",
  "helpdesk.settings.loadMembers": "Mitglieder laden",
  "helpdesk.settings.noAgents": "Keine Agents in dieser Gruppe.",
  "helpdesk.settings.pickAgent": "— Agent auswählen —",
  "helpdesk.settings.addMember": "Hinzufügen",
  "helpdesk.settings.removeFromGroup": "Aus Gruppe entfernen",
  "helpdesk.settings.emailDisplayNameShort": "Anzeigename:",
  "helpdesk.settings.otherWorkspace": "anderer Workspace",
  "helpdesk.settings.emailDisplayNameFull": "Anzeigename (Realname im Postfach)",
  "helpdesk.settings.placeholderSupportName": "z.B. Medtheris Support",
  "helpdesk.settings.emailActiveLabel": "Adresse aktiv (Versand möglich)",
  "helpdesk.settings.emailAddTitle": "Absender-Adresse hinzufügen",
  "helpdesk.settings.emailAddSubtitle": "E-Mail-Adresse, von der Tickets beantwortet werden.",
  "helpdesk.settings.create": "Anlegen",
  "helpdesk.settings.emailField": "E-Mail-Adresse",
  "helpdesk.settings.channelBinding": "Kanal-Bindung (optional)",
  "helpdesk.settings.channelBindingNone": "— ohne Kanal (nur Versand via globalem SMTP) —",
  "helpdesk.settings.channelPick": "Kanal {id} ({area})",
  "helpdesk.settings.channelBindingHint":
    "Ein Kanal definiert IMAP-Inbox + SMTP-Outbound. Ohne Kanal kann nur versendet werden – eingehende Mails an diese Adresse werden nicht zu Tickets.",
  "helpdesk.settings.placeholderEmail": "support@medtheris.ch",
  "helpdesk.settings.channelModalTitle": "E-Mail-Kanal einrichten",
  "helpdesk.settings.channelModalSubtitle":
    "Inbox via IMAP/POP3 + Outbound via SMTP. Verbindung wird vor dem Speichern geprüft.",
  "helpdesk.settings.testConnection": "Verbindung testen",
  "helpdesk.settings.noGroupsOption": "— keine Gruppen verfügbar —",
  "helpdesk.settings.groupSelectLabel": "Gruppe (eingehende Tickets landen hier)",
  "helpdesk.settings.overridePasswords":
    "Passwörter überschreiben (sonst werden bestehende behalten)",
  "helpdesk.settings.testShort": "Testen",
  "helpdesk.settings.name": "Name",
  "helpdesk.settings.inboundLabel": "Inbound",
  "helpdesk.settings.outboundLabel": "Outbound",
  "helpdesk.settings.refreshTitle": "Aktualisieren",
  "helpdesk.settings.inboundColon": "Inbound:",
  "helpdesk.settings.outboundColon": "Outbound:",
  "helpdesk.settings.testOk": "OK",

  "office.word.group.history": "Verlauf",
  "office.word.undo": "Rückgängig (Cmd/Ctrl+Z)",
  "office.word.redo": "Wiederholen (Cmd/Ctrl+Shift+Z)",
  "office.word.group.style": "Stil",
  "office.word.styleAria": "Stil",
  "office.word.paragraph": "Standard",
  "office.word.h1": "Überschrift 1",
  "office.word.h2": "Überschrift 2",
  "office.word.h3": "Überschrift 3",
  "office.word.h4": "Überschrift 4",
  "office.word.group.start": "Start",
  "office.word.bold": "Fett",
  "office.word.italic": "Kursiv",
  "office.word.underline": "Unterstrichen",
  "office.word.strike": "Durchgestrichen",
  "office.word.highlight": "Markieren",
  "office.word.inlineCode": "Inline-Code",
  "office.word.clearFormat": "Formatierung entfernen",
  "office.word.group.lists": "Listen",
  "office.word.bulletList": "Aufzählung",
  "office.word.orderedList": "Nummerierung",
  "office.word.taskList": "Aufgabenliste",
  "office.word.quote": "Zitat",
  "office.word.group.align": "Ausrichtung",
  "office.word.alignLeft": "Linksbündig",
  "office.word.alignCenter": "Zentriert",
  "office.word.alignRight": "Rechtsbündig",
  "office.word.alignJustify": "Blocksatz",
  "office.word.group.insert": "Einfügen",
  "office.word.insertLink": "Link einfügen",
  "office.word.promptUrl": "URL:",
  "office.word.insertImage": "Bild einfügen",
  "office.word.uploadFailed": "Bild-Upload fehlgeschlagen.",
  "office.word.insertTable": "Tabelle einfügen (3×3)",
  "office.word.insertSigField": "Signatur-Feld einfügen",
  "office.word.promptSigLabel": "Beschriftung des Signatur-Felds (z.B. „Auftraggeber“):",
  "office.word.sigDefault": "Unterschrift",
  "office.word.group.font": "Schrift",
  "office.word.fontSize": "Schriftgröße",
  "office.word.promptFontPt": "Schriftgröße in pt (8–48):",
  "office.word.group.find": "Suchen",
  "office.word.findReplace": "Suchen / Ersetzen (Cmd/Ctrl+F)",
  "office.word.group.merge": "Mail-Merge",
  "office.word.mergeFromCrm": "Serienbrief: aus CRM-Firmen Briefe generieren",
  "office.word.wordsTitle": "Wörter",
  "office.word.wordsCount": "{n} Wörter",
  "office.word.wordsCountOne": "1 Wort",
  "office.word.mergePanelHint":
    "Klick fügt den Token an der Cursor-Position ins Dokument",
  "office.word.mergeSelectVisible": "Sichtbare auswählen",
  "office.word.mergeClose": "Schließen",
  "office.word.findNext": "Nächster Treffer (Enter)",
  "office.word.findClose": "Schließen (Esc)",

  "office.sheet.undo": "Rückgängig (Cmd/Ctrl+Z)",
  "office.sheet.paste": "Einfügen (Cmd/Ctrl+V)",
  "office.sheet.alignLeft": "Linksbündig",
  "office.sheet.alignRight": "Rechtsbündig",
  "office.sheet.currencyChf": "Währung CHF",
  "office.sheet.clearFormat": "Format löschen",
  "office.sheet.insertGroup": "Einfügen",
  "office.sheet.rowAbove": "Zeile darüber einfügen",
  "office.sheet.rowBelow": "Zeile darunter einfügen",
  "office.sheet.rowDelete": "Zeile löschen",
  "office.sheet.colLeft": "Spalte links einfügen",
  "office.sheet.colRight": "Spalte rechts einfügen",
  "office.sheet.colDelete": "Spalte löschen",
  "office.sheet.textLengthRule": "Textlänge",
  "office.sheet.pickColTitle": "Spalte {col} auswählen",
  "office.sheet.pickRowTitle": "Zeile {row} auswählen",
  "office.sheet.filterActiveTitle": "Aktiver Filter — klick zum Ändern",
  "office.sheet.adjustHeightTitle": "Höhe anpassen",
  "office.sheet.reset": "Zurücksetzen",
  "office.sheet.findNextTitle": "Nächster Treffer (Enter)",
  "office.sheet.closeTitle": "Schließen (Esc)",
  "office.sheet.tabsHelpTitle":
    "Doppelklick: umbenennen · Rechtsklick: Menü · Ziehen zum Umsortieren",
  "office.sheet.sheetDelete": "Löschen",
  "office.sheet.sheetCloseAria": "Schließen",
  "office.sheet.cfAddRule": "Regel hinzufügen",
  "office.sheet.cfHeatMap": "Heat-Map (rot → grün)",
  "office.sheet.cfHeatMapHint": "Niedrige Werte rot, mittlere gelb, hohe grün.",
  "office.sheet.cfBlueOrangeHint": "Blau für niedrig, weiß mittig, orange für hoch.",
  "office.sheet.cfPositiveGreen": "Positive Werte grün",
  "office.sheet.cfPositiveGreenHint": "Markiert Zellen > 0 in Grün.",
  "office.sheet.paletteWhite": "Weiß",
  "office.sheet.paletteLightGreen": "Hellgrün",
  "office.sheet.paletteGreen": "Grün",

  "cmdk.dialogAria": "Globale Suche",
  "cmdk.placeholder":
    "Firmen, Personen, Deals, Signatur, Marketing, Tickets, Files, Plane, Integrationen …",
  "cmdk.closeEsc": "Schließen (Esc)",
  "cmdk.noResults": "Keine Treffer.",
  "cmdk.tipsTitle": "Tipps:",
  "cmdk.tipScopes":
    "Firmen, Personen, CRM-Deals, Documenso, Mautic-Kontakte, Zammad, Nextcloud, Plane; ohne Suchtext siehst du letzte Integrations-/Webhook-Events",
  "cmdk.tipNavigate": "↑↓ navigieren, ↩ öffnen, Esc schließen",
  "cmdk.tipShortcut": "⌘/Strg+K öffnet die Suche von überall",
  "cmdk.groupCompanies": "Firmen",
  "cmdk.groupPeople": "Personen",
  "cmdk.groupDeals": "Deals",
  "cmdk.groupSign": "Signatur",
  "cmdk.groupMarketing": "Marketing",
  "cmdk.groupFiles": "Dateien",
  "cmdk.groupPlane": "Plane",
  "cmdk.enterOpen": "öffnen",
  "cmdk.escapeCloseLabel": "schließen",
  "cmdk.footerGlobalSearch": "globale Suche",
  "cmdk.groupHelpdesk": "Helpdesk",
  "cmdk.groupIntegration": "Letzte Integrationen",

  "calls.preflight.title": "Mikrofon/Kamera nicht verfügbar",
  "calls.preflight.hint.denied.step1Before": "Klick auf das",
  "calls.preflight.hint.denied.step1Icon": "Schloss-Icon",
  "calls.preflight.hint.denied.step1After": "links neben der URL.",
  "calls.preflight.hint.denied.step2":
    "Setze Mikrofon und Kamera auf „Zulassen“.",
  "calls.preflight.hint.denied.step3": "Lade die Seite neu, danach „Erneut prüfen“ anklicken.",
  "calls.preflight.checkAgain": "Erneut prüfen",
  "calls.preflight.unsupported":
    "Dein Browser unterstützt keinen Mikrofon/Kamera-Zugriff. Bitte Chrome, Edge oder Firefox verwenden.",
  "calls.preflight.denied":
    "Mikrofon oder Kamera wurde blockiert. Erlaube den Zugriff in der Adressleiste (Schloss-Icon) und versuch es erneut.",
  "calls.preflight.noDevice":
    "Es wurde kein Mikrofon/keine Kamera gefunden. Stell sicher, dass ein Headset oder eine Webcam angeschlossen ist.",
  "calls.preflight.inUse":
    "Mikrofon/Kamera wird bereits von einer anderen App genutzt (Zoom, Teams, OBS …). Bitte schließe die App und versuch es erneut.",
  "calls.preflight.insecure":
    "Calls funktionieren nur über HTTPS oder localhost. Wechsle auf eine sichere URL.",
  "calls.preflight.unknown":
    "Mikrofon/Kamera konnte nicht initialisiert werden. Bitte erneut versuchen.",
  "calls.jitsi.invalidUrl": "Ungültige Call-URL",
  "calls.jitsi.externalApiMissing": "JitsiMeetExternalAPI nicht verfügbar",
  "calls.jitsi.openInTab": "In neuem Tab öffnen",
  "calls.jitsi.grantTitle": "Mikrofon & Kamera freigeben",
  "calls.jitsi.grantHint":
    "In der Adressleiste auf das Schloss-Symbol klicken, Mikrofon und Kamera erlauben, dann hier neu starten.",
  "calls.jitsi.retry": "Erneut versuchen",
  "calls.jitsi.fallbackIframeWithMessage":
    "External API: {message} — Fallback-Iframe.",
  "calls.jitsi.fallbackIframe": "External API fehlgeschlagen — Iframe-Fallback.",

  "admin.onboarding.scraper.pushConfirmCanton":
    "Profil {profile}: alle ungepushten Cache-Einträge aus Kanton {canton} jetzt ins CRM pushen?",
  "admin.onboarding.scraper.pushConfirmAll":
    "Profil {profile}: alle ungepushten Cache-Einträge ins CRM pushen?",
  "admin.onboarding.scraper.profilePlaceholder": "Profil wählen — der Rest des Formulars passt sich an.",
  "admin.onboarding.scraper.limitLabel": "Limit (max. Einträge)",
  "admin.onboarding.scraper.skipDuplicates": "überspringen",
  "admin.onboarding.scraper.skipDuplicatesHint":
    "Default: nur leere Felder werden gefüllt — vorhandene Daten werden nie überschrieben.",
  "admin.onboarding.scraper.llmDisabled": "LLM-Extraktion ist für dieses Profil bereits deaktiviert",
  "admin.onboarding.scraper.oneClickHint":
    "Ein Klick = ein Lauf. Während der Subprozess läuft, ist der Button deaktiviert.",
  "admin.onboarding.scraper.running": "Läuft...",
  "admin.onboarding.scraper.preflightIncomplete": "Konfiguration unvollständig: {missing}",
  "admin.onboarding.scraper.trigger": "Scraper anstoßen",
  "admin.onboarding.scraper.bannerIncomplete": "Konfiguration unvollständig — siehe Banner oben.",
  "admin.onboarding.scraper.bannerRunning": "Ein Lauf läuft gerade — bitte warten.",
  "admin.onboarding.scraper.phaseProcess": "Verarbeite Einträge",
  "admin.onboarding.scraper.chooseProfileBanner": "Profil wählen",
  "admin.onboarding.scraper.reconnectBanner": "Runner gerade nicht erreichbar — automatischer Reconnect läuft",
  "admin.onboarding.scraper.jobRunningBanner": "Aktuell läuft ein Scraper-Job",
  "admin.onboarding.scraper.stallHint": "Hinweis: über {seconds} s keine neue Zeile.",
  "admin.onboarding.scraper.chooseProfileCta": "Profil auswählen",
  "admin.onboarding.scraper.specialtiesHint":
    "Mindestens ein Fachgebiet auswählen — sonst wird die Discovery abgebrochen (keine Such-Queries).",
  "admin.onboarding.scraper.cronPlaceholder": "z. B. Physio ZH — täglich 05:30 UTC",
  "admin.onboarding.scraper.cacheDryRunHint":
    "Einträge, die der Scraper im Dry-Run oder bei einem Discovery-Lauf ermittelt hat.",
  "admin.onboarding.scraper.cacheEmptyCta":
    "Cache ist leer für dieses Profil — starte oben einen ersten Lauf.",
  "admin.onboarding.scraper.pushFooter":
    "Push schiebt nur ungepushte Einträge hoch — keine Detail-Calls, falls der Cache schon Daten hat.",
  "admin.onboarding.scraper.cacheEmptyDone": "Cache ist leer oder vollständig im CRM.",
  "admin.onboarding.scraper.pushAll": "Push alle {n} ungepushten Einträge",
  "admin.onboarding.scraper.preflightRunning": "Pre-flight für {profile} läuft …",
  "admin.onboarding.scraper.retryCheck": "Erneut prüfen",
  "admin.onboarding.scraper.recheck": "neu prüfen",
  "admin.onboarding.scraper.triggerBlocked": "{profile}: Konfiguration unvollständig — Trigger gesperrt",
  "admin.onboarding.scraper.envHint":
    "Ergänze fehlende Variablen in `/opt/corelab/.env` und führe `docker compose up -d` aus.",

  "admin.onboarding.leads.pickSegmentMerge":
    "Bitte oben ein Mautic-Segment wählen, bevor du übernimmst.",
  "admin.onboarding.leads.mergeFailed": "Übernehmen fehlgeschlagen: {message}",
  "admin.onboarding.leads.pickSegmentCheck":
    "Bitte oben ein Mautic-Segment wählen, bevor du den Final-Check startest.",
  "admin.onboarding.leads.optionChoose": "— wählen —",
  "admin.onboarding.leads.mauticOffline": "Mautic offline — Übernehmen deaktiviert.",
  "admin.onboarding.leads.emptyNewHint":
    "Keine Web-Form-Leads in NEW. Prüfe PUBLIC_LEAD_FORM_SECRET, POST /api/public/lead und Twenty-Workspace.",
  "admin.onboarding.leads.pickLead": "Wähle links einen Lead zur Prüfung.",
  "admin.onboarding.leads.noneToReview": "Keine Leads zur Prüfung.",
  "admin.onboarding.leads.mergePushesEmails":
    "Übernehmen pusht alle Personen mit E-Mail in",
  "admin.onboarding.leads.mergeToFunnel": "Übernehmen → Funnel",
  "admin.onboarding.leads.confirmTitle": "Final-Check — in den Funnel übernehmen",
  "admin.onboarding.leads.step3Confirm": "③ Bestätigen",
  "admin.onboarding.leads.checkRequired": "Prüfe die Pflichtsignale für",
  "admin.onboarding.leads.forceContinueWarn":
    "treffen — trotzdem fortfahren nur nach manueller Prüfung.",
  "admin.onboarding.leads.confirmMergeQuestion":
    "{name} jetzt in Mautic-Segment „{segment}\" übernehmen?",
  "admin.onboarding.leads.undoHint":
    "Dieser Vorgang kann rückgängig gemacht werden, indem du die Opportunity in Twenty wieder anpasst — Mautic-Kontakte bleiben bestehen.",
  "admin.onboarding.leads.back": "Zurück",
  "admin.onboarding.leads.confirmBlockedTitle": "Bestätigung erforderlich",
  "admin.onboarding.leads.confirmBlockedMissing": "Adresse und Website müssen vorliegen",
  "admin.onboarding.leads.mergeNow": "Jetzt übernehmen",

  "sign.documents": "Signaturen",
  "sign.status.draft": "Entwürfe",
  "sign.status.pending": "Ausstehend",
  "sign.status.completed": "Abgeschlossen",
  "sign.status.rejected": "Abgelehnt",
  "sign.scope.all": "Alle",
  "sign.upload": "Hochladen",
  "sign.send": "Senden",
  "sign.empty.list": "Keine Dokumente.",
  "sign.empty.selection": "Wähle ein Dokument aus oder lade ein neues hoch.",

  "sign.notConfiguredDefault": "Sign ist für diesen Workspace nicht eingerichtet.",
  "sign.error.invalidResponse": "Ungültige Antwort vom Server.",
  "sign.actionFailed": "Aktion fehlgeschlagen",
  "sign.visibilityChangeFailed": "Sichtbarkeit konnte nicht geändert werden",
  "sign.deleteConfirm": "„{title}“ wirklich löschen?",
  "sign.deleteFailed": "Löschen fehlgeschlagen",
  "sign.upload.convertedNamed": "„{name}“ wurde nach PDF konvertiert und hochgeladen. Empfänger und Felder im Editor zuordnen.",
  "sign.upload.plainNamed": "„{name}“ wurde hochgeladen. Empfänger und Felder im Editor zuordnen.",
  "sign.time.justNow": "gerade eben",
  "sign.time.minsAgo": "vor {n} min",
  "sign.time.hoursAgo": "vor {n} h",
  "sign.time.daysAgo": "vor {n} d",
  "sign.salesFlow.title": "Vertriebsablauf (Kurz)",
  "sign.salesFlow.step1Title": "1. Entwurf",
  "sign.salesFlow.step1Body": "PDF hochladen (oder aus Office exportieren). Felder & Empfänger im Editor.",
  "sign.salesFlow.step2Title": "2. Zur Unterschrift",
  "sign.salesFlow.step2Body": "senden; Empfänger erhalten Documenso-Mail.",
  "sign.salesFlow.step3Title": "3. Erledigt",
  "sign.salesFlow.step3Body": "PDF archivieren (Documenso).",
  "sign.crmLinkActive": "CRM-Verknüpfung aktiv: Upload landet mit Documenso-",
  "sign.companyHub": "Zum Company-Hub",
  "sign.upload.teamCheckbox": "Für das gesamte Team in dieser Sign-Liste sichtbar (sonst Standard:",
  "sign.upload.onlyMe": "nur für mich",
  "sign.upload.formatsTitle": "PDF, DOCX, ODT, RTF, TXT u.v.m. — Nicht-PDFs werden automatisch konvertiert",
  "sign.upload.uploading": "Wird hochgeladen…",
  "sign.upload.documentButton": "Dokument hochladen",
  "sign.manageInDocumenso": "In Documenso verwalten",
  "sign.autoPdfFooter": "Word, ODT & mehr werden automatisch zu PDF",
  "sign.search.placeholder": "Titel suchen…",
  "sign.list.oneDoc": "1 Dokument",
  "sign.list.nDocs": "{n} Dokumente",
  "sign.notConfigured.title": "Sign noch nicht eingerichtet",
  "sign.notConfigured.provision": "Jetzt provisionieren",
  "sign.empty.noMatch": "Keine Treffer",
  "sign.empty.noDocuments": "Noch keine Dokumente",
  "sign.empty.hintOtherSearch": "Versuche einen anderen Suchbegriff.",
  "sign.empty.hintCreateDocumenso": "Lege das erste Dokument hier oder in Documenso an.",
  "sign.empty.hintUploadSidebar": "Lade über die linke Seitenleiste ein Dokument hoch oder warte auf freigegebene Dokumente.",
  "sign.detail.emptyNativeTitle": "Native Sign-Integration",
  "sign.detail.emptyNativeHint": "Sobald für diesen Workspace ein Documenso-Team konfiguriert ist, erscheinen hier die Dokumente.",
  "sign.detail.pickDocumentTitle": "Kein Dokument gewählt",
  "sign.detail.pickDocumentHint": "Wähle links ein Dokument, um Status, Empfänger und Aktionen zu sehen — oder lege ein neues an.",
  "sign.openInDocumenso": "In Documenso öffnen",
  "sign.chunkSignWorkspace": "Sign ·",
  "sign.row.privateListed": "In CoreLab nur für dich gelistet",
  "sign.row.stalledHint": "Liegt seit Tagen unangetastet — eine Erinnerung könnte helfen.",
  "sign.row.signedProgress": "unterzeichnet",
  "sign.row.lastActivity": "Letzte Aktivität",
  "sign.signingStatus.pending": "Ausstehend",
  "sign.signingStatus.signed": "Unterzeichnet",
  "sign.signingStatus.rejected": "Abgelehnt",
  "sign.emailStatus.sent": "E-Mail gesendet",
  "sign.emailStatus.notSent": "E-Mail nicht gesendet",
  "sign.sales.nextDraft": "Nächster Schritt: „Felder & Empfänger im Editor“, dann zur Unterschrift senden.",
  "sign.sales.nextPending": "Nächster Schritt: Auf Unterschriften warten — bei Bedarf erinnern.",
  "sign.sales.nextCompleted": "Abgeschlossen — PDF unten als Archiv herunterladen oder in Documenso öffnen.",
  "sign.sales.nextRejected": "Abgelehnt — neues Dokument anlegen oder Details in Documenso prüfen.",
  "sign.detail.progressAllSigned": "Alle Empfänger haben unterzeichnet",
  "sign.detail.signedProgressLine": "{signed} von {total} Empfängern haben unterzeichnet",
  "sign.detail.progressOneRejected": "Mindestens ein Empfänger hat abgelehnt",
  "sign.detail.progressDraft": "Entwurf — noch nicht versendet",
  "sign.detail.createdOn": "Erstellt",
  "sign.detail.completedOn": "Abgeschlossen",
  "sign.detail.stalledText": "ohne Bewegung. Eine Erinnerung — gerne mit kurzem persönlichem Hinweis — hilft erfahrungsgemäß deutlich.",
  "sign.detail.stalledLead": "Dieses Dokument liegt seit",
  "sign.detail.smtpWarningTitle": "Einladungs-E-Mail für die aktuelle Runde noch nicht versendet.",
  "sign.detail.smtpWarningBody": "Mindestens ein Unterzeichner, der jetzt an der Reihe ist, steht auf „E-Mail nicht gesendet“. Typisch: SMTP/Versand in der Documenso-Instanz (Team-Einstellungen), Absender-Domain/DNS, Spam-Ordner — oder unten den persönlichen Link kopieren / „Erinnern“ nutzen.",
  "sign.detail.sequentialTitle": "Unterschriften-Reihenfolge aktiv.",
  "sign.detail.sequentialBody": "Unterzeichner, die erst nach anderen dran sind, bleiben bei Documenso oft auf „E-Mail nicht gesendet“, bis alle vorigen unterschrieben haben — das ist vorgesehen. Sobald der vorherige Schritt erledigt ist, geht der Versand weiter; sonst SMTP in Documenso prüfen.",
  "sign.detail.preflightTitle": "Signatur-Felder fehlen bei Documenso.",
  "sign.detail.preflightBody": "Ohne mindestens ein Feld „Signatur“ pro Unterzeichner auf dem PDF kann nicht versendet werden.",
  "sign.detail.preflightMissingFor": "Fehlt für:",
  "sign.detail.preflightEditorStrong": "Felder & Empfänger im Editor",
  "sign.detail.preflightSendStrong": "Senden",
  "sign.detail.preflightInstructionBefore": "Bitte",
  "sign.detail.preflightInstructionMid":
    "öffnen, Felder platzieren und dort auf",
  "sign.detail.preflightInstructionEnd": "klicken.",
  "sign.detail.portalRef": "Portal-Referenz:",
  "sign.detail.pdfView": "PDF anzeigen",
  "sign.detail.pdfViewTitle": "PDF im neuen Tab anzeigen (läuft über das Portal — kein separater Documenso-Login nötig).",
  "sign.detail.pdfExplainer": "Die Vorschau ist das Basis-PDF (z. B. Text aus Word/Mail-Merge direkt im Dokument). Signatur-, Datum- und Editor-Felder sind Documenso-Overlays — Unterschriften und gesetzte Datumsangaben erscheinen hier erst, wenn die Empfänger signiert haben (oder im abgeschlossenen Archiv-PDF). Für Namenszeilen im Editor den Feldtyp „Name“ nutzen, damit Documenso den Empfängernamen zuverlässig einträgt.",
  "sign.detail.editorButton": "Felder & Empfänger im Editor",
  "sign.detail.sendDirect": "Direkt senden",
  "sign.detail.sendDirectTitleOk": "Sendet die Signatur-Mail mit der Standard-Vorlage des Teams.",
  "sign.detail.sendDirectTitleBlocked": "Zuerst im Editor Signatur-Felder auf dem PDF platzieren.",
  "sign.detail.withMessage": "Mit Nachricht…",
  "sign.detail.sendMessageTitleOk": "Vor dem Senden Betreff und persönliche Nachricht eingeben.",
  "sign.detail.sendMessageTitleBlocked": "Zuerst Signatur-Felder im Editor setzen.",
  "sign.detail.remindAll": "Alle erinnern",
  "sign.detail.remindAllTitle": "Sendet die Signatur-Mail noch einmal an alle, die noch nicht unterschrieben haben.",
  "sign.detail.remindMessageTitle": "Erinnerung mit personalisierter Nachricht senden.",
  "sign.detail.archivePdf": "PDF archivieren",
  "sign.detail.archivePdfTitle": "Signiertes PDF als Datei speichern (Archiv)",
  "sign.detail.repeatSend": "Erneut versenden",
  "sign.detail.repeatSendTitle": "Legt eine neue Entwurfs-Kopie mit denselben Empfängern an. Die signierten Felder müssen im Editor neu gesetzt werden.",
  "sign.detail.openDraft": "Entwurf öffnen",
  "sign.detail.openDetail": "Detail öffnen",
  "sign.detail.delete": "Löschen",
  "sign.detail.recipientsWithCount": "Empfänger ({n})",
  "sign.detail.recipients": "Empfänger",
  "sign.detail.orderHelp": "Nummer = Unterschriften-Reihenfolge (zuerst niedrigere Zahl). „E-Mail nicht gesendet“ bei späteren Schritten ist oft normal.",
  "sign.detail.parallelHelp": "∥ = keine feste Reihenfolge — Einladungen parallel.",
  "sign.detail.noRecipientsYet": "Noch keine Empfänger zugewiesen.",
  "sign.sidebar.listCoreLab": "Liste (CoreLab)",
  "sign.sidebar.privateVisible": "Nur in deinem Sign-Bereich sichtbar",
  "sign.sidebar.teamVisible": "Für alle mit Workspace-Zugang",
  "sign.sidebar.onlyMe": "Nur ich",
  "sign.sidebar.team": "Team",
  "sign.sidebar.listNote": "Betrifft nur die CoreLab-Sign-Liste, nicht die Sichtbarkeit in Documenso selbst.",
  "sign.sidebar.listReadOnly": "Nur für im Portal hochgeladene Dokumente änderbar.",
  "sign.sidebar.source": "Quelle",
  "sign.sidebar.sourceUpload": "Direkter Upload",
  "sign.sidebar.sourceTemplate": "Vorlage",
  "sign.sidebar.sourceTemplateDirect": "Vorlage (Direct Link)",
  "sign.sidebar.visibility": "Sichtbar",
  "sign.sidebar.visTeam": "Team",
  "sign.sidebar.visManager": "Manager+",
  "sign.sidebar.visAdmin": "Admin",
  "sign.sidebar.timestamps": "Zeitstempel",
  "sign.sidebar.created": "Erstellt",
  "sign.sidebar.updated": "Aktualisiert",
  "sign.sidebar.completed": "Abgeschlossen",
  "sign.sidebar.owner": "Inhaber",
  "sign.sidebar.progress": "Fortschritt",
  "sign.sidebar.signedFraction": "unterzeichnet",
  "sign.recipient.stepTitle": "Unterschriften-Schritt {n}",
  "sign.recipient.parallelTitle": "Parallel — keine feste Reihenfolge",
  "sign.recipient.opened": "Geöffnet",
  "sign.recipient.copyLinkTitle": "Persönlichen Unterzeichnen-Link in die Zwischenablage",
  "sign.recipient.link": "Link",
  "sign.recipient.remindTitle": "Neue Signatur-Mail an {email} verschicken.",
  "sign.recipient.remind": "Erinnern",
  "sign.recipient.messageTitle": "Persönliche Nachricht an {email} mitsenden.",
  "sign.prompt.copySignLink": "Link zum Unterzeichnen kopieren:",
  "sign.compose.sendNow": "Jetzt senden",
  "sign.compose.remindSend": "Erinnerung senden",
  "sign.compose.headlineSend": "Dokument versenden",
  "sign.compose.headlineRemindOne": "Erinnerung an {email}",
  "sign.compose.headlineRemindAll": "Erinnerung an alle Offenen",
  "sign.compose.introSend": "Optionaler Betreff und persönliche Nachricht — bleibt das Feld leer, schickt Documenso die Standard-Vorlage des Teams.",
  "sign.compose.introRemind": "Wird zusätzlich zur Standard-Erinnerung mitgeschickt.",
  "sign.compose.subjectLabel": "Betreff (optional)",
  "sign.compose.subjectPlaceholder": "z. B. „{title}“ – bitte unterzeichnen",
  "sign.compose.messageLabel": "Nachricht (optional)",
  "sign.compose.messagePlaceholder": "Hi Vorname, magst du noch kurz drüberschauen? Danke!",
  "sign.role.SIGNER": "UNTERZEICHNER",
  "sign.role.APPROVER": "BESTÄTIGER",
  "sign.role.VIEWER": "BEOBACHTER",
  "sign.role.CC": "CC",
  "sign.role.ASSISTANT": "ASSISTENT",
  "sign.editor.field.signature": "Signatur",
  "sign.editor.field.initials": "Initialen",
  "sign.editor.field.date": "Datum",
  "sign.editor.field.text": "Text",
  "sign.editor.field.name": "Name",
  "sign.editor.field.hint.signature": "Unterschrift des Empfängers",
  "sign.editor.field.hint.initials": "Kurzkennung an mehreren Stellen",
  "sign.editor.field.hint.date": "Wird automatisch beim Unterschreiben gefüllt",
  "sign.editor.field.hint.text": "Frei beschreibbares Feld",
  "sign.editor.field.hint.name": "Documenso trägt den Namen des Empfängers ein (besser als freies Text-Feld)",
  "sign.editor.persistEmpty": "Documenso hat nach dem Speichern keine Felder zurückgegeben — vermutlich API-/Berechtigungsproblem. Bitte Netzwerk-Tab prüfen oder erneut versuchen.",
  "sign.editor.alert.needRecipient": "Mindestens ein Empfänger nötig.",
  "sign.editor.alert.validEmail": "Jeder Empfänger braucht eine gültige E-Mail.",
  "sign.editor.alert.needSignature": "Bitte ergänzen für:",
  "sign.editor.alert.fieldRecipientMismatch": "Einige Felder sind keinem gespeicherten Empfänger zugeordnet. Bitte „Empfänger speichern“ wählen und erneut „Senden“.",
  "sign.editor.confirm.removeRecipient": "Empfänger „{name}“ und alle zugewiesenen Felder entfernen?",
  "sign.editor.recipientSave": "Empfänger speichern",
  "sign.editor.send": "Senden",
  "sign.editor.resend": "Erneut senden",
  "sign.editor.recipientsHeading": "Empfänger",
  "sign.editor.addRecipientTitle": "Empfänger hinzufügen",
  "sign.editor.noRecipients": "Noch keine Empfänger. „+“ klicken oder direkt unten ergänzen.",
  "sign.editor.role.approver": "Bestätigt",
  "sign.editor.shortcuts": "Pfeiltasten = nudge · Entf = löschen",
  "sign.editor.removeFieldAria": "Feld entfernen",
  "sign.editor.activeFor": "Aktiv für:",
  "sign.editor.workflowStrong": "Versand-Workflow:",
  "sign.editor.workflowBody": "Beim Klick auf „Senden“ speichern wir Empfänger, persistieren noch nicht gespeicherte Felder und verteilen das Dokument per Documenso-API (Empfänger-Mails inkl. Signaturlink).",
  "sign.editor.placeOnPdf": "Klick auf das PDF, um zu platzieren",
  "sign.editor.sendFailed": "Senden fehlgeschlagen",
  "sign.editor.missingSigIntro": "Documenso verlangt pro Unterzeichner mindestens ein Feld „Signatur“. Nur Datum/Text/Initialen reichen nicht. Bitte ergänzen für:",
  "sign.editor.placeFieldsLead": "Felder platzieren",
  "sign.editor.fieldsCountOne": "1 Feld",
  "sign.editor.fieldsCountMany": "{n} Felder",
  "sign.editor.mobileHint": "Hinweis: Felder am Desktop platzieren — auf dem Smartphone sind die Drag-Handles winzig.",
  "sign.editor.recipientsCountOne": "1 Empfänger",
  "sign.editor.recipientsCountMany": "{n} Empfänger",
  "sign.editor.trayHeading": "Felder",
  "sign.editor.trayHint":
    "In das Dokument ziehen oder Typ wählen & auf die Seite klicken.",
  "sign.editor.loadingPdf": "PDF wird geladen…",
  "sign.editor.fieldOverlayTitle":
    "{label} · {name} (Ziehen zum Verschieben, Pfeiltasten zum Feinjustieren)",
  "sign.editor.toolbarHints":
    "Drag & Drop · Feld anklicken zum Verschieben/Größe ändern ·",
  "sign.editor.placeholder.name": "Name",
  "sign.editor.placeholder.email": "E-Mail",
  "sign.editor.removeRecipientTitle": "Entfernen",
  "sign.editor.orderTitle": "Reihenfolge",
  "sign.editor.roleOption.signer": "Signiert",
  "sign.editor.roleOption.viewer": "Liest mit",
  "sign.editor.pdfDownloadFailed": "PDF-Download fehlgeschlagen ({status})",
  "sign.editor.pageIndicator": "Seite {current} / {total}",


  "pane.mobile.backToList": "Zurück zur Liste",
  "pane.sidebar.expand": "Seitenleiste ausklappen",
  "pane.sidebar.collapse": "Seitenleiste einklappen",
  "pane.sidebar.toggleAria": "Seitenleiste umschalten",
  "pane.sidebar.showTitle": "Seitenleiste einblenden",
  "pane.splitter.resizeWidth": "Breite anpassen",
  "pane.sidebar.dragResize": "Seitenleiste verschieben",

  "calls.title": "Calls",
  "calls.newCall": "Neuer Call",
  "calls.active": "Aktiv",
  "calls.history": "Verlauf",
  "calls.empty.list": "Keine Calls",
  "calls.empty.selection": "Wähle einen Call aus oder starte einen neuen.",
  "calls.composer.subject": "Betreff",
  "calls.composer.start": "Call starten",
  "calls.composer.title": "Neuen Call starten",
  "calls.composer.subjectPlaceholder": "z. B. Sales-Demo Praxis Müller",
  "calls.composer.contextLabel": "Kontext",
  "calls.composer.unlinkTitle": "Verknüpfung entfernen",
  "calls.composer.contextHint":
    "Tipp: Aus CRM/Helpdesk/Chat öffnet ein Click-to-Call den Composer mit vorbelegtem Kontext.",
  "calls.list.header.active": "Aktive Calls",
  "calls.list.header.all": "Alle Calls",
  "calls.search.placeholder": "Suche Subject, Teilnehmer …",
  "calls.alert.startFailed": "Call konnte nicht gestartet werden: ",
  "calls.alert.endFailed": "Beenden fehlgeschlagen: ",
  "calls.defaultSubject": "Spontan-Call",
  "calls.empty.filtered.title": "Keine Calls in diesem Filter.",
  "calls.empty.filtered.hint": "Starte einen neuen Call oder ändere den Filter.",
  "calls.selection.title": "Wähle einen Call",
  "calls.selection.hint":
    "Aus der Liste, oder klicke „Neuer Call“, um einen Raum zu starten.",
  "calls.context.crmContact": "CRM-Kontakt",
  "calls.context.chatRoom": "Chat-Raum",
  "calls.context.projectIssue": "Projekt-Issue",
  "calls.context.adhoc": "Spontan-Call",
  "calls.context.ticket": "Ticket",
  "calls.detail.join": "Beitreten",
  "calls.detail.openNewTab": "In neuem Tab",
  "calls.detail.endCall": "Call beenden",
  "calls.detail.ended": "Beendet",
  "calls.detail.startedBy": "gestartet von {name}",
  "calls.detail.durationLabel": "Dauer",
  "calls.detail.endedWithDuration": "Call beendet · Dauer {duration}",
  "calls.detail.section.participants": "Teilnehmer",
  "calls.detail.section.context": "Kontext",
  "calls.detail.section.room": "Raum",
  "calls.detail.online": "online",
  "calls.detail.noParticipantsYet": "Noch niemand beigetreten.",
  "calls.detail.copyInviteTitle": "Einladungslink kopieren",
  "calls.detail.copyLink": "Link kopieren",
  "calls.detail.adhocNoLink": "Spontan-Call ohne Verknüpfung.",
  "calls.meeting.backToList": "Liste",
  "calls.meeting.leave": "Meeting verlassen",
  "calls.meeting.maximize": "Meeting maximieren",
  "calls.meeting.minimize": "Minimieren (Liste / Chat nutzbar)",
  "calls.meeting.openNewTab": "In neuem Tab öffnen",
  "calls.meeting.copyInvite": "Einladungslink kopieren",
  "calls.meeting.listBackTooltip": "{label} (Meeting läuft weiter)",
  "calls.conn.qualityTitle": "Verbindungsqualität: {q}/100",
  "calls.conn.good": "Gut",
  "calls.conn.ok": "OK",
  "calls.conn.poor": "Schwach",
  "calls.stage.activeParticipantsTitle": "{count} aktive Teilnehmer",
  "calls.stage.ariaActiveCall": "Aktiver Call",
  "calls.stage.pipSubtitleActive": "{count} aktiv",
  "calls.confirm.endForEveryone": "Call für alle beenden?",
  "calls.shell.backTooltip": "Zurück zur Liste (Call läuft weiter im Hintergrund)",
  "calls.incoming.portalTitle": "Eingehender Portal-Call",
  "calls.incoming.chatVoiceShort": "Sprach-Anruf",
  "calls.incoming.chatVideoShort": "Video-Anruf",
  "calls.incoming.chatVoiceLong": "Sprach-Anruf (Chat)",
  "calls.incoming.chatVideoLong": "Video-Anruf (Chat)",
  "calls.incoming.dismissTitle": "Nicht mehr anzeigen",
  "calls.incoming.accept": "Annehmen",
  "calls.incoming.acceptHereSuffix": " (hier)",
  "calls.incoming.openInWindow": "In Fenster öffnen",
  "calls.incoming.popupWindow": "Pop-up-Fenster",
  "calls.incoming.chatOnlyLink": "Nur Chat",
  "calls.incoming.chatOnlyButton": "Nur zum Chat",
  "calls.incoming.jitsiLink": "Jitsi",
  "calls.incoming.jitsiNewWindow": "Jitsi (neues Fenster)",
  "calls.incoming.allowDesktopNotify":
    "Desktop-Benachrichtigung erlauben (wenn Tab nicht sichtbar)",
  "calls.incoming.footerSignedInPrefix": "Angemeldet als {email}. ",
  "calls.incoming.footerHint":
    "Portal- und Chat-Anrufe teilen sich dieselbe Meeting-Oberfläche.",
  "calls.incoming.tabTitlePrefix": "Anruf:",

  "chat.createMenuTitle": "Neu erstellen",
  "chat.newChannel": "Neuer Kanal",
  "chat.newDm": "Neue Direktnachricht",
  "chat.channelsSection": "Kanäle",
  "chat.channelsEmpty": "Keine Kanäle für diese Suche.",
  "chat.dmSection": "Direktnachrichten",
  "chat.dmEmpty": "Noch keine Direktnachrichten",
  "chat.refreshRooms": "Aktualisieren",
  "chat.sidebarResizeAria": "Seitenleiste verschieben",
  "chat.pickRoomHint": "Wähle einen Kanal oder eine Person aus",
  "chat.backToChannelListAria": "Zur Kanalliste",
  "chat.generalChannel": "Allgemein",
  "chat.privateAria": "Privat",
  "chat.lastActivePrefix": "Zuletzt aktiv:",
  "chat.videoCallTitle": "Video-Anruf (Jitsi)",
  "chat.video": "Video",
  "chat.voiceCallTitle": "Sprach-Anruf (nur Audio)",
  "chat.tel": "Tel",
  "chat.filesTitle": "Dateien in diesem Kanal",
  "chat.files": "Dateien",
  "chat.channelSettings": "Kanal-Einstellungen",
  "chat.loadingMessages": "Lade Nachrichten …",
  "chat.noMessagesYet": "Noch keine Nachrichten. Sag „Hallo“!",
  "chat.dropFileHint": "Datei hier ablegen, um sie zu senden",
  "chat.removeAttachmentTitle": "Anhang entfernen",
  "chat.captionPlaceholder": "Optional: Bildunterschrift …",
  "chat.messageTo": "Nachricht an {name}",
  "chat.sendTitle": "Senden (Enter)",
  "chat.composerHintDesktop": "Enter zum Senden · Shift + Enter für neue Zeile",
  "chat.composerHintMobile":
    "Zum Senden „Senden“ tippen · Mehrzeilig mit Zeilenumbruch",
  "chat.alert.uploadFailed": "Datei-Upload fehlgeschlagen: ",
  "chat.alert.sendFailed": "Senden fehlgeschlagen: ",
  "chat.alert.startCallFailed": "Call konnte nicht gestartet werden.",
  "chat.defaultMeetingSubject": "Besprechung",
  "chat.drawer.closeTitle": "Schließen",
  "chat.drawer.closeAria": "Schließen",
  "chat.tab.members": "Mitglieder",
  "chat.tab.files": "Dateien",
  "chat.tab.settings": "Einstellungen",
  "chat.members.confirmRemove":
    "@{username} wirklich aus diesem Kanal entfernen?",
  "chat.members.removeTooltip": "@{username} entfernen",
  "chat.members.forbiddenRemove":
    "Keine Berechtigung. Nur Owner/Moderatoren können Mitglieder entfernen.",
  "chat.members.invite": "Mitglied einladen",
  "chat.members.loading": "Lade Mitglieder …",
  "chat.members.none": "Noch keine Mitglieder",
  "chat.members.ownerAria": "Owner",
  "chat.members.moderator": "Moderator",
  "chat.members.member": "Mitglied",
  "chat.members.inviteModalTitle": "Mitglied einladen",
  "chat.members.errorStatus": "Fehler {status}",
  "chat.members.inviteForbidden":
    "Keine Berechtigung. Nur Owner/Moderatoren können einladen.",
  "chat.members.userNotFound": "@{username} existiert nicht im Chat.",
  "chat.members.searchPlaceholder": "Name oder @username",
  "chat.members.searching": "Suche …",
  "chat.members.noResults": "Niemand gefunden",
  "chat.files.loading": "Lade Dateien …",
  "chat.files.empty": "Noch keine Dateien geteilt.",
  "chat.files.channelCountOne": "{count} Datei im Kanal",
  "chat.files.channelCountMany": "{count} Dateien im Kanal",
  "chat.files.loadingLabel": "Lade Dateien …",
  "chat.files.emptyDetail":
    "Anhänge über die Büroklammer im Eingabefeld oder per Drag & Drop in den Chat.",
  "chat.settings.sectionDescription": "Beschreibung",
  "chat.settings.topicPlaceholder": "Worüber wird hier gesprochen?",
  "chat.settings.discard": "Verwerfen",
  "chat.settings.save": "Speichern",
  "chat.settings.visibility": "Sichtbarkeit",
  "chat.settings.private": "Privat",
  "chat.settings.public": "Öffentlich",
  "chat.settings.privateHint":
    "Nur eingeladene Mitglieder sehen diesen Kanal.",
  "chat.settings.publicHint":
    "Jede:r im Workspace kann diesen Kanal sehen und beitreten.",
  "chat.settings.visibilityConfirm":
    "Diesen Kanal wirklich auf {target} stellen? Bestehende Mitglieder bleiben erhalten.",
  "chat.settings.visibilityPublicWord": "öffentlich",
  "chat.settings.visibilityPrivateWord": "privat",
  "chat.settings.toggleVisibility": "Auf {target} stellen",
  "chat.settings.archiveConfirm":
    "Kanal wirklich archivieren? Er bleibt erhalten, ist aber nicht mehr aktiv.",
  "chat.settings.archive": "Archivieren",
  "chat.settings.restricted":
    "Nur Owner und Moderatoren können Kanal-Einstellungen ändern.",
  "chat.inviteOnlySidebarHint":
    "Nur eingeladene Mitglieder sehen den Kanal und seine Inhalte.",
  "chat.sidebar.emptyTeamsLine1": "Keine Team-Kanäle in {workspace}.",
  "chat.sidebar.emptyTeamsLine2":
    "Du kannst rechts unten eine Direktnachricht starten.",
  "chat.team.noChannelsYet": "Noch keine Kanäle",
  "chat.settings.dangerZone": "Gefahrenzone",
  "chat.settings.archiveHint":
    "Archivierte Kanäle werden ausgeblendet, aber nicht gelöscht. Ein Workspace-Admin kann sie reaktivieren.",

  "chat.newDmModal.title": "Person finden",
  "chat.newDmModal.placeholder": "Name oder @username",
  "chat.newDmModal.searching": "Suche …",
  "chat.newDmModal.noResults": "Niemand gefunden",

  "chat.newChannelModal.title": "Neuer Kanal in {workspace}",
  "chat.newChannelModal.nameLabel": "Name",
  "chat.newChannelModal.namePlaceholder": "z.B. kineo-retail",
  "chat.newChannelModal.slugSavedAsPrefix": "Wird gespeichert als",
  "chat.newChannelModal.topicLabel": "Beschreibung (optional)",
  "chat.newChannelModal.topicPlaceholder": "Worüber wird hier gesprochen?",
  "chat.newChannelModal.teamLabel": "Team (optional)",
  "chat.newChannelModal.noTeamOption": "— Kein Team —",
  "chat.newChannelModal.teamHint":
    "Teams gruppieren zusammengehörende Kanäle in der Seitenleiste.",
  "chat.newChannelModal.publicHint":
    "Jede:r in {workspace} kann beitreten und mitlesen.",
  "chat.newChannelModal.createButton": "Kanal erstellen",
  "chat.newChannelModal.errorMinLength": "Name muss mindestens 2 Zeichen haben",
  "chat.newChannelModal.errorDuplicateName":
    "Ein Kanal mit diesem Namen existiert bereits.",
  "chat.newChannelModal.errorGeneric": "Fehler {status}",

  "chat.bubble.meetingLink": "Meeting-Link",
  "chat.bubble.fileFallback": "Datei",
  "chat.bubble.attachmentFallback": "Anhang",

  "chat.invite.pastVoiceSelf": "Vergangener Sprach-Anruf",
  "chat.invite.pastVideoSelf": "Vergangener Video-Anruf",
  "chat.invite.pastVoiceOther": "Verpasster Sprach-Anruf",
  "chat.invite.pastVideoOther": "Verpasster Video-Anruf",
  "chat.invite.activeVoice": "Sprach-Anruf",
  "chat.invite.activeVideo": "Video-Anruf",
  "chat.invite.sameRoomParen": "({count}× ein Raum)",
  "chat.invite.join": "Beitreten",
  "chat.invite.linkLabel": "Link",
  "chat.invite.historySameRoomPrefix": "{count}× gleicher Raum, ",
  "chat.invite.when.today": "{hm} Uhr",
  "chat.invite.when.yesterday": "gestern {hm} Uhr",
  "chat.invite.when.sameDayRange": "{start}–{end} Uhr",

  "chat.overlay.chromeTitleVoice": "Sprach-Anruf (Team)",
  "chat.overlay.chromeTitleVideo": "Video-Anruf (Team)",
  "chat.overlay.endCall": "Anruf beenden",
  "chat.overlay.participantFallback": "Teilnehmer",
  "chat.overlay.jitsiAppSuffix": "Team-Anruf",

  "projects.view.board": "Board",
  "projects.view.backlog": "Backlog",
  "projects.view.sprints": "Sprints",
  "projects.view.roadmap": "Roadmap",
  "projects.view.list": "Liste",
  "projects.newIssue": "Neues Issue",
  "projects.newProject": "Neues Projekt",
  "projects.empty.list": "Keine Projekte.",
  "projects.empty.selection": "Wähle ein Projekt aus.",
  "projects.import": "Import",
  "projects.import.title": "Issues aus CSV importieren",
  "projects.import.description":
    "Lädt Issues aus einer CSV-Datei in das aktuelle Projekt. Erkennt Jira-, Linear- und Plane-Spalten automatisch — fehlende Mappings kannst du unten anpassen.",
  "projects.import.upload": "CSV hochladen",
  "projects.import.paste": "oder hier einfügen …",
  "projects.import.delimiter": "Trenner",
  "projects.import.delimiter.auto": "automatisch",
  "projects.import.preview": "Vorschau",
  "projects.import.mapping": "Spalten-Mapping",
  "projects.import.mapping.column": "Spalte",
  "projects.import.mapping.field": "Feld",
  "projects.import.field.ignore": "Ignorieren",
  "projects.import.field.name": "Titel",
  "projects.import.field.description": "Beschreibung",
  "projects.import.field.state": "Status",
  "projects.import.field.priority": "Priorität",
  "projects.import.field.assignee": "Bearbeiter",
  "projects.import.field.labels": "Labels",
  "projects.import.field.startDate": "Startdatum",
  "projects.import.field.targetDate": "Zieldatum",
  "projects.import.field.estimatePoint": "Schätzung",
  "projects.import.totals.rows": "Zeilen",
  "projects.import.totals.valid": "gültig",
  "projects.import.totals.skipped": "übersprungen",
  "projects.import.totals.unmapped": "unbekannte Labels",
  "projects.import.autoLabels": "Fehlende Labels automatisch anlegen",
  "projects.import.run": "Importieren",
  "projects.import.running": "Importiere …",
  "projects.import.done": "{count} Issues importiert.",
  "projects.import.failed": "{count} Zeilen fehlgeschlagen.",
  "projects.import.empty": "Noch keine CSV geladen.",
  "projects.import.help.jira":
    "Tipp: In Jira → Filter → „Export → CSV (alle Felder)“ liefert ein direkt kompatibles Format.",
  "projects.delete.action": "Projekt löschen",
  "projects.delete.confirm":
    "Projekt endgültig löschen? Alle Issues und Daten in Plane zu diesem Projekt gehen verloren.",
  "projects.delete.failed": "Projekt konnte nicht gelöscht werden: ",
  "projects.settings.lead":
    "Issues, Boards und Cycles kannst du direkt hier verwalten. Profil-Einstellungen und die volle Plane-Oberfläche erreichst du über Plane — dieselbe Zuordnung wie über die SSO-Brücke.",
  "projects.settings.link.portalViews": "Portal-Ansicht (Board, Backlog …)",
  "projects.settings.link.planeHub": "Plane-Hub · Direktzugriffe",
  "projects.settings.link.openPlane": "Plane öffnen (SSO-Brücke)",
  "projects.settings.link.profile": "Plane-Profil & Konto-Einstellungen",
  "projects.settings.instance": "Instanz",
  "projects.settings.crumbSettings": "Einstellungen",

  "projects.priority.urgent": "Dringend",
  "projects.priority.high": "Hoch",
  "projects.priority.medium": "Mittel",
  "projects.priority.low": "Niedrig",
  "projects.priority.none": "Keine",
  "projects.stateGroup.backlog": "Backlog",
  "projects.stateGroup.unstarted": "To Do",
  "projects.stateGroup.started": "In Arbeit",
  "projects.stateGroup.completed": "Erledigt",
  "projects.stateGroup.cancelled": "Abgebrochen",
  "projects.issueType.story": "Story",
  "projects.issueType.task": "Task",
  "projects.issueType.bug": "Bug",
  "projects.issueType.epic": "Epic",
  "projects.issueType.subtask": "Sub-Task",
  "projects.cycle.current": "Aktiv",
  "projects.cycle.upcoming": "Geplant",
  "projects.cycle.completed": "Abgeschlossen",
  "projects.cycle.draft": "Entwurf",
  "projects.groupBy.status": "Status",
  "projects.groupBy.assignee": "Bearbeiter",
  "projects.groupBy.priority": "Priorität",
  "projects.groupBy.type": "Issue-Typ",
  "projects.groupBy.epic": "Epic / Modul",
  "projects.board.groupBy": "Gruppieren nach:",
  "projects.board.quickFilter": "Schnell-Filter:",
  "projects.board.quickFilterReset": "zurücksetzen",
  "projects.board.assigneeFilterTitle": "Nur Issues von {name}",
  "projects.board.doneFraction": "{done} / {total}",
  "projects.board.doneWord": "erledigt",
  "projects.board.assignedCount": "{n} zugewiesen",
  "projects.board.completedRatio": "{done} / {total}",
  "projects.board.createPlaceholder": "Was ist zu tun?",
  "projects.board.createIssue": "Issue erstellen",
  "projects.sprint.noWindow": "ohne Zeitfenster",
  "projects.sprint.closed": "abgeschlossen",
  "projects.sprint.noEnd": "kein Enddatum",
  "projects.sprint.overdueDays": "{n} Tage überfällig",
  "projects.sprint.endsToday": "endet heute",
  "projects.sprint.oneDayLeft": "noch 1 Tag",
  "projects.sprint.daysLeft": "noch {n} Tage",
  "projects.column.nobody": "Niemand",
  "projects.column.unknownEpic": "Unbekanntes Epic",
  "projects.column.noEpic": "Kein Epic",
  "projects.stat.issues": "Issues",
  "projects.stat.done": "Erledigt",
  "projects.stat.inProgress": "In Arbeit",
  "projects.stat.points": "Story Points",
  "projects.sprints.header": "Sprints",
  "projects.sprints.newTooltip": "Neuer Sprint",
  "projects.sprints.namePh": "Sprint-Name…",
  "projects.sprints.cancel": "Abbrechen",
  "projects.sprints.create": "Anlegen",
  "projects.sprints.empty": "Noch kein Sprint angelegt.",
  "projects.sprints.pick": "Wähle einen Sprint links.",
  "projects.sprints.editTooltip": "Bearbeiten",
  "projects.sprints.deleteTooltip": "Sprint löschen",
  "projects.sprints.deleteConfirm": "Sprint „{name}“ wirklich löschen?",
  "projects.card.due": "Fällig: {date}",
  "projects.card.subIssues": "{n} Sub-Issues",
  "projects.card.unassigned": "Niemand zugewiesen",
  "projects.card.pointsTooltip": "{n} Story Points",
  "projects.crumb.projects": "Projekte",
  "projects.empty.pickSidebar": "Wähle links ein Projekt.",
  "projects.loadingInline": "lädt…",
  "projects.issueRow.placeholder":
    "Was ist zu tun? Enter zum Anlegen, Esc zum Abbrechen.",
  "projects.count.issuesShown": "{filtered} / {total} Issues",
  "projects.link.planeHubTitle": "Plane-Hub (Workspace-Direktzugriff)",
  "projects.openPlaneTooltip": "In Plane öffnen",
  "projects.reloadTooltip": "Neu laden",
  "projects.starTooltip": "Favorit",
  "projects.button.newIssue": "Issue",
  "projects.prompt.newProjectName": "Name des neuen Projekts:",
  "projects.prompt.projectKey":
    "Kurzkennung (Großbuchstaben, max. 5 Zeichen — optional):",
  "projects.alert.createProject": "Projekt anlegen fehlgeschlagen: ",
  "projects.alert.createIssue": "Issue anlegen fehlgeschlagen: ",
  "projects.alert.saveIssue": "Speichern fehlgeschlagen: ",
  "projects.alert.deleteIssueConfirm": "Issue wirklich löschen?",
  "projects.alert.deleteIssue": "Löschen fehlgeschlagen: ",
  "projects.alert.cycleAssign": "Sprint-Zuweisung fehlgeschlagen: ",
  "projects.alert.createCycle": "Sprint anlegen fehlgeschlagen: ",
  "projects.alert.saveCycle": "Sprint speichern fehlgeschlagen: ",
  "projects.alert.deleteCycle": "Sprint löschen fehlgeschlagen: ",
  "projects.sidebar.expand": "Projekte einblenden",
  "projects.list.filteredEmpty": "Keine Issues mit diesem Filter.",
  "projects.filter.priorityLabel": "Priorität",
  "projects.filter.assigneeLabel": "Bearbeiter",
  "projects.filter.labelsHeading": "Labels",
  "projects.filter.reset": "Filter zurücksetzen",
  "projects.searchIssues": "Suche…",
  "projects.issueDrawer.closeTooltip": "Schließen",
  "projects.issueDrawer.descriptionSection": "Beschreibung",
  "projects.issueDrawer.descriptionPlaceholder": "Beschreibung hinzufügen…",
  "projects.issueDrawer.issueTypeLabel": "Issue-Typ",
  "projects.issueDrawer.selectPlaceholder": "— wählen —",
  "projects.issueDrawer.priorityLabel": "Priorität",
  "projects.issueDrawer.assigneesLabel": "Bearbeiter",
  "projects.issueDrawer.sprintLabel": "Sprint",
  "projects.issueDrawer.backlogOption": "— Backlog —",
  "projects.issueDrawer.sprintActiveBadge": "· Aktiv",
  "projects.issueDrawer.sprintPlannedBadge": "· Geplant",
  "projects.issueDrawer.sprintEndsPrefix": "Endet",
  "projects.issueDrawer.parentIssueLabel": "Parent-Issue",
  "projects.issueDrawer.noParentOption": "— keiner —",
  "projects.issueDrawer.storyPointsLabel": "Story Points",
  "projects.issueDrawer.startLabel": "Start",
  "projects.issueDrawer.dueLabel": "Fällig",
  "projects.issueDrawer.createdPrefix": "Erstellt",
  "projects.issueDrawer.updatedPrefix": "Geändert",
  "projects.issueDrawer.completedPrefix": "Erledigt",
  "projects.issueDrawer.deleteIssue": "Issue löschen",
  "projects.issueDrawer.subtasksTitle": "Sub-Tasks",
  "projects.issueDrawer.subtasksWithCount": "Sub-Tasks ({count})",
  "projects.issueDrawer.addSubtask": "Sub-Task hinzufügen",
  "projects.issueDrawer.subtaskPlaceholder": "Sub-Task…",
  "projects.issueDrawer.createButton": "Anlegen",
  "projects.issueDrawer.addAnotherSubtask": "Weitere Sub-Task",
  "projects.issueDrawer.activityTitle": "Aktivität",
  "projects.issueDrawer.activityWithCount": "Aktivität ({count})",
  "projects.issueDrawer.loading": "lädt…",
  "projects.issueDrawer.unknownAuthor": "Unbekannt",
  "projects.issueDrawer.commentFailedPrefix": "Kommentar fehlgeschlagen: ",
  "projects.issueDrawer.commentPlaceholder":
    "Kommentar verfassen … (Strg/⌘+Enter zum Senden)",
  "projects.issueDrawer.sendButton": "Senden",
  "projects.backlog.selectedCount": "{count} ausgewählt",
  "projects.backlog.moveToSprint": "In Sprint verschieben…",
  "projects.backlog.move": "Verschieben",
  "projects.backlog.clearSelection": "Auswahl aufheben",
  "projects.backlog.startSprintConfirm":
    "Sprint „{name}“ starten? Startdatum wird auf heute gesetzt.",
  "projects.backlog.completeSprintConfirm": "Sprint „{name}“ abschließen?",
  "projects.backlog.startSprintTooltip": "Sprint starten",
  "projects.backlog.startSprint": "Sprint starten",
  "projects.backlog.completeSprintTooltip": "Sprint abschließen",
  "projects.backlog.complete": "Abschließen",
  "projects.backlog.newIssueTooltip": "Neues Issue",
  "projects.backlog.emptyBacklog": "Backlog ist leer.",
  "projects.backlog.emptySprint":
    "Sprint ist leer — Issues aus dem Backlog verschieben.",
  "projects.backlog.badgeActive": "Aktiv",
  "projects.backlog.badgePlanned": "Geplant",
  "projects.roadmap.title": "Roadmap",
  "projects.roadmap.subtitle": "{count} Sprints mit Zeitfenster",
  "projects.roadmap.weeks": "Wochen",
  "projects.roadmap.months": "Monate",
  "projects.roadmap.today": "Heute",
  "projects.roadmap.todayTooltip": "Heute",
  "projects.roadmap.sprintColumn": "Sprint",
  "projects.roadmap.empty":
    "Noch keine Sprints mit Start- und Enddatum.",
  "projects.roadmap.weekLabel": "KW {n}",
  "projects.roadmap.resizeEndTooltip": "Enddatum verschieben",

  "files.upload": "Hochladen",
  "files.newFolder": "Neuer Ordner",
  "files.newDocument": "Neues Dokument",
  "files.newSpreadsheet": "Neue Tabelle",
  "files.newPresentation": "Neue Präsentation",
  "files.newNote": "Neue Notiz",
  "files.empty": "Dieser Ordner ist leer.",
  "files.title": "Datei-Station",
  "files.myDrive": "Meine Ablage",
  "files.subtitle": "{workspace} · in der Cloud gespeichert",
  "files.search.here": "In Ordner suchen…",
  "files.search.everywhere": "Workspace-weit suchen…",
  "files.search.titleHere": "Wieder nur in diesem Ordner suchen",
  "files.search.titleEverywhere": "Workspace-weit suchen (alle Ordner)",
  "files.allFolders": "alle Ordner",
  "files.newTooltip": "Neue Datei oder Ordner anlegen",
  "files.plusNew": "Neu",
  "files.menu.doc": "Dokument (.docx)",
  "files.menu.docHint": "Word-kompatibel",
  "files.menu.sheet": "Tabelle (.xlsx)",
  "files.menu.sheetHint": "Excel-kompatibel",
  "files.menu.slides": "Präsentation (.pptx)",
  "files.menu.slidesHint": "PowerPoint-kompatibel",
  "files.menu.note": "Notiz (.md)",
  "files.menu.noteHint": "Markdown",
  "files.menu.folder": "Ordner",
  "files.menu.folderHint": "im aktuellen Verzeichnis",
  "files.menu.uploadHint": "von diesem Gerät",
  "files.upload.tooltip": "Dateien hochladen",
  "files.reload": "Neu laden",
  "files.detail.toggleHide": "Detailbereich ausblenden",
  "files.detail.toggleShow": "Detailbereich einblenden",
  "files.prompt.newFile": "Name der neuen Datei:",
  "files.prompt.newFolder": "Name des neuen Ordners:",
  "files.alert.mkdir": "Ordner anlegen fehlgeschlagen: ",
  "files.alert.delete": "Löschen fehlgeschlagen: ",
  "files.alert.createDoc": "Anlegen fehlgeschlagen: ",
  "files.alert.uploadPrefix": "Fehler beim Upload:\n",
  "files.confirm.delete": "„{name}“ wirklich löschen?",
  "files.alert.presentationId":
    "Präsentation angelegt; Datei-ID noch nicht verfügbar — bitte Ordner neu laden und die Datei öffnen.",
  "files.search.minChars": "Tippe mindestens 2 Zeichen für die Workspace-weite Suche.",
  "files.search.running": "Suche läuft…",
  "files.search.none": "Keine Treffer für „{q}“.",
  "files.search.error": "Suche fehlgeschlagen: {error}",
  "files.column.name": "Name",
  "files.column.modified": "Geändert",
  "files.column.size": "Größe",
  "files.detail.pick":
    "Wähle eine Datei oder einen Ordner, um Details zu sehen.",
  "files.kind.folder": "Ordner",
  "files.kind.file": "Datei",
  "files.path": "Pfad",
  "files.download": "Herunterladen",
  "files.openInFolder": "Im Ordner „{path}“ öffnen",
  "files.open.folder": "Öffnen",
  "files.open.portalEditor": "Im Editor öffnen",
  "files.open.presentationEditor": "In OpenOffice öffnen",
  "files.open.preview": "Vorschau",

  "marketing.title": "Marketing",
  "marketing.subtitleMautic": "Mautic",
  "marketing.settingsTooltip": "Einstellungen",
  "marketing.openMauticTooltip": "In Mautic öffnen",
  "marketing.section.overview": "Übersicht",
  "marketing.section.contacts": "Kontakte",
  "marketing.section.segments": "Segmente",
  "marketing.section.campaigns": "Kampagnen",
  "marketing.section.emails": "Mails",
  "marketing.kpi.contacts": "Kontakte",
  "marketing.kpi.active7d": "Aktiv 7d",
  "marketing.kpi.segments": "Segmente",
  "marketing.kpi.campaigns": "Kampagnen",
  "marketing.kpi.campaignActiveSuffix": "aktiv",
  "marketing.visibleCount": "{count} sichtbar",
  "marketing.reloadTooltip": "Neu laden",
  "marketing.searchPlaceholder": "Suche…",
  "marketing.notConfiguredBanner": "Mautic ist noch nicht eingerichtet.",
  "marketing.notConfiguredDetailTitle": "Mautic ist noch nicht einsatzbereit",
  "marketing.setup.openUi": "Mautic-UI öffnen:",
  "marketing.setup.adminUser": "Initial-Admin anlegen (DB-Connection ist via Compose schon hinterlegt).",
  "marketing.setup.apiSettings":
    "Settings → Configuration → API Settings → API enabled + HTTP basic auth enabled aktivieren.",
  "marketing.setup.portalUser":
    "Settings → Users → neuer User portal-bridge, Rolle Administrator.",
  "marketing.setup.envKeys":
    "Sein Passwort plus Username in .env als MAUTIC_API_USERNAME / MAUTIC_API_TOKEN eintragen, Stack neu starten.",
  "marketing.pickRecordTitle": "Wähle einen Eintrag",
  "marketing.pickRecordHint":
    "Editor-/Builder-Funktionen (Mail-Designer, Campaign-Editor, Forms) öffnen sich in Mautic — Klick rechts oben auf das ↗-Symbol.",
  "marketing.contactFallback": "Kontakt #{id}",
  "marketing.overview.loading": "Lade…",
  "marketing.overview.setupHint":
    "Mautic muss noch eingerichtet werden — siehe Anleitung rechts.",
  "marketing.overview.noData": "Keine Daten.",
  "marketing.tile.activeCampaigns": "Aktive Kampagnen",
  "marketing.tile.emailsPublished": "Mails veröffentlicht",
  "marketing.tile.sendsTotal": "Versand gesamt",
  "marketing.tile.sendsHint": "Summe sentCount aller Mails",
  "marketing.tile.segments": "Segmente",
  "marketing.openMauticUi": "Mautic-UI öffnen",
  "marketing.detail.overviewTitle": "Marketing-Übersicht",
  "marketing.detail.overviewSubtitle": "Mautic",
  "marketing.noOverview": "Keine Übersicht verfügbar.",
  "marketing.bigKpi.contactsSub": "{recent} aktiv 7d",
  "marketing.bigKpi.segmentsSub": "Listen",
  "marketing.bigKpi.campaignsSub": "{total} insgesamt",
  "marketing.bigKpi.emailsSub": "{total} insgesamt",
  "marketing.bigKpi.sentSub": "Versendet",
  "marketing.bigKpi.sentHint": "Summe aller Mails",
  "marketing.nextStepsTitle": "Nächste Schritte",
  "marketing.nextSteps.crmSegments":
    "Im Twenty-CRM die Stage-Pipeline mit Mautic-Segmenten verknüpfen.",
  "marketing.nextSteps.drip":
    "3-Step Drip-Campaign in Mautic anlegen (Welcome → Use-Case → Demo).",
  "marketing.nextSteps.smtp":
    "SMTP-Sender (Migadu johannes@medtheris.kineo360.work) im Mautic-Channel hinterlegen.",
  "marketing.nextSteps.form":
    "Form auf der Landing-Page einbetten → Submissions landen automatisch in Mautic-Kontakten.",
  "marketing.crm.openInTwenty": "In Twenty öffnen ({workspace})",
  "marketing.crm.searching": "Suche im CRM…",
  "marketing.crm.noPersonForEmail":
    "Keine passende CRM-Person für {email} gefunden.",
  "marketing.crm.unnamedPerson": "(ohne Name)",
  "marketing.sidebar.crm": "CRM",
  "marketing.sidebar.properties": "Eigenschaften",
  "marketing.sidebar.tags": "Tags",
  "marketing.contact.fieldsHeading": "Kontaktdaten",
  "marketing.contact.pointsLabel": "Punkte",
  "marketing.contact.stageLabel": "Stage",
  "marketing.email.createdLabel": "Erstellt",
  "marketing.email.typeLabel": "Typ",
  "marketing.detail.openInMautic": "in Mautic",
  "marketing.activity.last": "Letzte Aktivität",
  "marketing.segment.noDescription": "Keine Beschreibung.",
  "marketing.segment.statusPublished": "veröffentlicht",
  "marketing.segment.statusDraft": "Entwurf",
  "marketing.campaign.activatedToast":
    "Kampagne aktiviert. Mautic verteilt Kontakte ab jetzt durch den Flow.",
  "marketing.campaign.pausedToast":
    "Kampagne pausiert. Bestehende Kontakte bleiben an ihrem Schritt stehen, neue Trigger werden ignoriert.",
  "marketing.campaign.cloneFull":
    "Kopie angelegt — Flow + Audience wurden übernommen, Status: Entwurf.",
  "marketing.campaign.cloneMeta":
    "Kopie angelegt (nur Metadaten) — Mautic-API kopiert auf dieser Version keine Events. Schritte im Builder rekonstruieren.",
  "marketing.campaign.startHint":
    "Kampagne starten — Mautic schiebt Kontakte durch den Flow.",
  "marketing.campaign.pauseTooltip":
    "Kampagne pausieren — neue Trigger werden ignoriert.",
  "marketing.campaign.pause": "Pausieren",
  "marketing.campaign.start": "Starten",
  "marketing.campaign.duplicateTooltip":
    "Als pausierten Entwurf duplizieren — Audience + Flow werden mitkopiert.",
  "marketing.campaign.duplicate": "Duplizieren",
  "marketing.campaign.editor": "Editor",
  "marketing.campaign.noCategory": "Ohne Kategorie",
  "marketing.builderHint":
    "Mautic-Builder. Start, Pause und Duplizieren laufen direkt aus dem Portal — alles andere ist im Editor („In Mautic öffnen“).",
  "marketing.email.designerInMautic": "Designer in Mautic",
  "marketing.email.opened": "Geöffnet",
  "marketing.email.openRate": "Open-Rate",
  "marketing.email.statusPublished": "veröffentlicht",

  "office.openIn": "Öffnen in …",
  "office.tagline":
    "{workspace} · Word & Excel im Portal; Folien im OpenOffice-Editor (Nextcloud)",
  "office.search.placeholder": "In Dokumenten suchen…",
  "office.upload": "Hochladen",
  "office.reload": "Neu laden",
  "office.crmContext": "CRM-Kontext aktiv",
  "office.link.companyHub": "Company-Hub",
  "office.link.sign": "Dokument zur Unterschrift (Sign)",
  "office.section.new": "Neues Dokument",
  "office.hint.portalEditor": "Neu → Portal-Editor (nicht Nextcloud)",
  "office.compat.word": "Word-kompatibel (.docx)",
  "office.compat.excel": "Excel-kompatibel (.xlsx)",
  "office.compat.ppt": "PowerPoint-kompatibel (.pptx)",
  "office.compat.md": "Markdown-Datei (.md)",
  "office.createTitle": "{label} im aktuellen Workspace anlegen",
  "office.proposal.title": "Angebot / Proposal aus CRM",
  "office.proposal.subtitle":
    "Vorlage wählen, Firma anklicken, DOCX erzeugen (gleiche Variablen wie Serienbrief)",
  "office.proposal.mergeVersionLine":
    "CRM-Merge v{merge} · Presets v{preset}{suffix}",
  "office.proposal.sectionTemplate": "Vorlage",
  "office.proposal.templatePresets": "Eingebaute Vorlagen",
  "office.proposal.templateCloudDocs": "Aus Cloud (/Documents)",
  "office.proposal.sectionVariables": "Variablen",
  "office.proposal.sectionCompany": "Firma",
  "office.proposal.loadingCompanies": "Lade Firmen…",
  "office.proposal.preview": "Vorschau",
  "office.proposal.downloadDocx": "DOCX laden",
  "office.proposal.tokensFound": "Erkannte Platzhalter:",
  "office.proposal.footerMergeZip":
    "Serienbrief für viele Empfänger: Dokument im Editor öffnen → Serienbrief (ZIP).",
  "office.proposal.cloudFormatsHint":
    "Nur .docx, .html unter {docs}. In Word Platzhalter als {{company.name}} einfügen.",
  "office.proposal.loadingTemplateFile": "Vorlage wird geladen…",
  "office.proposal.loadingDocList": "Lade Liste…",
  "office.proposal.noTemplatesInFolder":
    "Keine passenden Dateien. Lege z. B. Angebot.docx in {docs} ab.",
  "office.proposal.activeTemplate": "Aktiv:",
  "office.proposal.conversionNote": "Hinweis Konvertierung:",
  "office.proposal.error.pickCompany": "Bitte eine Firma wählen.",
  "office.proposal.error.pickCloudTemplate":
    "Bitte eine Vorlage aus /Documents auswählen.",
  "office.proposal.error.noPresetTemplate": "Keine Vorlage.",
  "office.recents": "Zuletzt geändert in {dir}",
  "office.empty":
    "Noch keine Office-Dateien hier. Lege oben eine an oder lade etwas hoch.",
  "office.prompt.filename": "Name der neuen Datei:",
  "office.alert.create": "Anlegen fehlgeschlagen: ",
  "office.alert.upload": "Fehler beim Upload:\n",
  "office.alert.presentationId":
    "Präsentation wurde angelegt, aber Nextcloud liefert noch keine Datei-ID. Bitte Liste aktualisieren und erneut öffnen.",
};

const en: Messages = {
  "common.loading": "Loading …",
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.delete": "Delete",
  "common.edit": "Edit",
  "common.close": "Close",
  "common.search": "Search",
  "common.refresh": "Refresh",
  "common.open": "Open",
  "common.back": "Back",
  "common.new": "New",
  "common.send": "Send",
  "common.reply": "Reply",
  "common.replyAll": "Reply all",
  "common.forward": "Forward",
  "common.settings": "Settings",
  "common.filter": "Filter",
  "common.more": "More",
  "common.all": "All",
  "common.none": "None",
  "common.empty": "Empty",
  "common.noResults": "No results.",
  "common.noEntries": "No entries.",
  "common.error": "Error",
  "common.retry": "Retry",
  "common.upload": "Upload",
  "error.workspaceTitle": "This view crashed",
  "error.workspaceLead": "A component inside the workspace threw an exception. Sidebar and top bar are still available — you can reset this view or reload the whole page.",
  "error.retry": "Reset view",
  "error.reloadPage": "Reload page",
  "common.download": "Download",
  "common.copy": "Copy",
  "common.copied": "Copied",
  "common.create": "Create",
  "common.add": "Add",
  "common.remove": "Remove",
  "common.confirm": "Confirm",
  "common.yes": "Yes",
  "common.no": "No",
  "common.from": "From",
  "common.to": "To",
  "common.subject": "Subject",
  "common.date": "Date",
  "common.status": "Status",
  "common.priority": "Priority",
  "common.assignee": "Assignee",
  "common.author": "Author",
  "common.title": "Title",
  "common.description": "Description",
  "common.notes": "Notes",
  "common.attachments": "Attachments",
  "common.activity": "Activity",
  "common.details": "Details",
  "common.today": "Today",
  "common.yesterday": "Yesterday",
  "common.dateUnknown": "Unknown",
  "common.openInNewTab": "Open in new tab",
  "common.reload": "Reload",
  "common.thisWeek": "This week",
  "common.relative.justNow": "just now",
  "common.relative.minutesAgo": "{n} min ago",
  "common.relative.hoursAgo": "{n} h ago",
  "common.relative.daysAgoOne": "1 day ago",
  "common.relative.daysAgoMany": "{n} days ago",
  "common.menu.open": "Open menu",
  "common.menu.close": "Close menu",

  "login.heading": "Corehub Workstation",
  "login.subtitle":
    "One sign-in. Every tool. A workspace for Corehub, MedTheris and Kineo.",
  "login.cta": "Sign in with Kineo360 SSO",
  "login.divider": "Secured via Keycloak",
  "login.help": "Use your Kineo360 SSO account.",
  "login.problems": "Trouble signing in? Reach out to",
  "login.subline": "One sign-in. Every tool.",
  "login.cardTitle": "Sign in",
  "login.errorPrefix": "Sign-in failed:",
  "login.brandBar": "Corehub · Workstation",
  "login.internalBadge": "Internal",

  "nav.dashboard": "Dashboard",
  "nav.mail": "Mail",
  "nav.chat": "Chat",
  "nav.calendar": "Calendar",
  "nav.calls": "Calls",
  "nav.files": "Files",
  "nav.gapReport": "Gap report",
  "nav.office": "Office",
  "nav.crm": "CRM",
  "nav.helpdesk": "Helpdesk",
  "nav.projects": "Projects",
  "nav.sign": "Sign",
  "nav.code": "Code",
  "nav.status": "Status",
  "nav.identity": "Identity",
  "nav.proxy": "Reverse Proxy",
  "nav.admin": "Admin",
  "nav.onboarding": "Onboarding",
  "nav.opsDashboard": "Operations Dashboard",
  "nav.marketing": "Marketing",
  "nav.aiKnowledge": "AI knowledge",
  "nav.dashboard.short": "Overview",
  "nav.badge.soon": "soon",

  "sidebar.healthUnknown": "Status unknown",
  "sidebar.healthAllUp": "All systems up · {up}/{total}",
  "sidebar.healthPartialDown": "{down} down · {up}/{total}",
  "sidebar.healthLastCheck": "Last check: {time}",

  "pulse.titleWithWorkspace": "Pulse · {name}",
  "pulse.titleDefault": "Live · your pulse",
  "pulse.updated": "updated {time}",
  "pulse.mail.unread": "Unread mail",
  "pulse.mail.hintTotal": "{total} total in inbox",
  "pulse.mail.inboxEmpty": "Inbox empty",
  "pulse.mail.offlineHint": "Could not connect to IMAP",
  "pulse.tasks.today": "Due today",
  "pulse.tasks.notInWorkspace": "Not yet in Plane workspace “{slug}”",
  "pulse.tasks.noProjects": "No projects in workspace",
  "pulse.tasks.openAssigned": "{n} open issues total",
  "pulse.tasks.apiUnreachable": "Plane API unreachable",
  "pulse.chat.label": "Chat",
  "pulse.chat.hint": "Live counter coming soon",
  "pulse.feed.label": "Integration",
  "pulse.feed.empty": "No webhook events for this workspace yet.",
  "pulse.feed.hintSignCompleted": "Sign · document completed",
  "pulse.feed.hubSign": "Sign",
  "pulse.feed.hubHelpdesk": "Helpdesk",
  "pulse.feed.hubCrm": "CRM",
  "pulse.feed.hubProjects": "Projects",
  "pulse.feed.hubOffice": "Office",
  "pulse.feed.hubCalendar": "Calendar",
  "pulse.feed.hubCommunication": "Chat",
  "pulse.feed.hubDefault": "Integration",

  "dash.inbox.title": "Inbox today",
  "dash.inbox.loadingSnapshot": "Loading live snapshot…",
  "dash.inbox.allDone": "All clear — nice work.",
  "dash.inbox.waitingMany": "{n} things waiting for you",
  "dash.inbox.loading": "Loading…",
  "dash.inbox.mailUnread": "Unread mail",
  "dash.inbox.allFoldersHint": "all folders",
  "dash.inbox.ticketsOpen": "Open tickets",
  "dash.inbox.ticketsWithSla": "{n} SLA at risk",
  "dash.inbox.ticketsNoSla": "no SLA risk",
  "dash.inbox.slaRisk": "SLA risk",
  "dash.inbox.slaRiskHint": "Tickets near deadline",
  "dash.inbox.helpdeskDisabled": "Helpdesk is not configured for this workspace.",

  "dash.myIssues.title": "My issues today",
  "dash.myIssues.loadingSnapshot": "Loading Plane snapshot…",
  "dash.myIssues.loadingShort": "Loading…",
  "dash.myIssues.subtitleOverdueLine":
    "{overdue} overdue · {restDueToday} due today",
  "dash.myIssues.subtitleDueToday": "{n} due today",
  "dash.myIssues.subtitleOpenNoDue": "{n} open — nothing due today",
  "dash.myIssues.inboxZero": "Inbox zero. Nice.",
  "dash.myIssues.emptyBody":
    "No open issues assigned to you. If that surprises you, they may be assigned to a group instead of you directly.",
  "dash.myIssues.moreCount": "+ {n} more",
  "dash.myIssues.priorityTitle": "Priority: {priority}",
  "dash.myIssues.due.today": "today",
  "dash.myIssues.due.yesterday": "yesterday",
  "dash.myIssues.due.tomorrow": "tomorrow",
  "dash.myIssues.due.daysAgo": "{n}d ago",
  "dash.myIssues.due.daysIn": "in {n}d",

  "dash.quickCapture.openAria": "Open quick capture",
  "dash.quickCapture.toggleTitle": "Quick capture (⌘⇧N) · {n} notes",
  "dash.quickCapture.heading": "Quick capture",
  "dash.quickCapture.savedCount": "{n} saved",
  "dash.quickCapture.placeholder": "What do you want to remember?",
  "dash.quickCapture.keyboardHints": "⌘↩ save · Esc cancel",
  "dash.quickCapture.save": "Save",

  "portal.helpdeskPublic.replySent": "Your reply has been sent.",
  "portal.helpdeskPublic.statusPrefix": "Status:",
  "portal.helpdeskPublic.priorityPrefix": "Priority:",
  "portal.helpdeskPublic.metaOpenedUpdated":
    "Opened {opened} · last updated {updated}",
  "portal.helpdeskPublic.refreshTitle": "Reload replies",
  "portal.helpdeskPublic.refreshing": "Refreshing…",
  "portal.helpdeskPublic.refresh": "Refresh",
  "portal.helpdeskPublic.noArticles": "No messages yet.",
  "portal.helpdeskPublic.replyHeading": "Reply",
  "portal.helpdeskPublic.replyPlaceholder":
    "Write your reply to the support team…",
  "portal.helpdeskPublic.linkExpires": "Link active until",
  "portal.helpdeskPublic.sending": "Sending…",
  "portal.helpdeskPublic.sendReply": "Send reply",
  "portal.helpdeskPublic.footerMagicLink":
    "This page was shared with you via a magic link. Only the support team can access it without the link.",
  "portal.helpdeskPublic.unknownAuthor": "Unknown",

  "dash.greeting.morning": "Good morning",
  "dash.greeting.day": "Good afternoon",
  "dash.greeting.evening": "Good evening",
  "dash.greeting.night": "Good night",
  "dash.quick.title": "Three hubs — quick access",
  "dash.quick.subtitle": "As in the product vision",
  "dash.tips.heading": "Short and useful",

  "dash.followups.title": "What you're waiting on",
  "dash.followups.busy": "Comparing Sent ↔ Inbox …",
  "dash.followups.ready": "Mail search ready.",
  "dash.followups.empty": "No open threads older than {days} days.",
  "dash.followups.summaryOne": "{n} mail without a reply for {days} days",
  "dash.followups.summaryMany": "{n} mails without a reply for {days} days",
  "dash.followups.thresholdTitle": "Threshold in days",
  "dash.followups.comparing": "Comparing…",
  "dash.followups.allClear":
    "All clear. If you've just sent something important and it doesn't show up here yet — check back later, the trigger kicks in after {days} days.",
  "dash.followups.recipientPrefix": "to {recipient}",
  "dash.followups.mailLink": "Mail",

  "dash.mentions.title": "Mentions for you",
  "dash.mentions.loading": "Loading chat mentions …",
  "dash.mentions.ready": "Ready",
  "dash.mentions.empty": "No open @ mentions",
  "dash.mentions.summaryOne": "{n} mention in {rooms} room",
  "dash.mentions.summaryMany": "{n} mentions in {rooms} rooms",
  "dash.mentions.refresh": "Refresh",
  "dash.mentions.chatLink": "Chat",
  "dash.mentions.emptyHint":
    "You have no open mentions right now. If someone pings you with @<your-name>, it will show up here — even when you're not logged into chat.",
  "dash.mentions.breakdownTooltip":
    "{direct} direct · {group} group mentions",
  "dash.mentions.unreadInline": "{n} unread",
  "dash.mentions.directInline": "{n}× direct",
  "dash.mentions.groupInline": "{n}× @here",

  "dash.hub.communication.title": "Communication",
  "dash.hub.office.title": "Office hub",
  "dash.hub.project.title": "Project hub",

  "dash.corehub.communication.blurb":
    "Mail, chat, calendar, video calls — everything that bundles conversations.",
  "dash.corehub.office.blurb":
    "Files, contracts, CRM — content and customer master data.",
  "dash.corehub.project.blurb": "Delivery — issues, boards, repository.",

  "dash.corehub.hint.mail": "Inbox & team mail",
  "dash.corehub.hint.chat": "Channels & DMs",
  "dash.corehub.hint.calendar": "Meetings & slots",
  "dash.corehub.hint.calls": "Jitsi · rooms & history",
  "dash.corehub.hint.files": "Nextcloud file station",
  "dash.corehub.hint.office": "Word & Excel in portal",
  "dash.corehub.hint.sign": "Documenso · signatures",
  "dash.corehub.hint.crm": "Twenty · pipeline",
  "dash.corehub.hint.aiKnowledge": "Company context for replies",
  "dash.corehub.hint.projects": "Plane · issues & board",
  "dash.corehub.hint.code": "Gitea · repos & CI",

  "dash.medtheris.communication.blurb":
    "First contact to support — one path for the customer.",
  "dash.medtheris.office.blurb": "Offers, campaigns, documents.",
  "dash.medtheris.project.blurb": "Plane · delivery and cycles.",

  "dash.medtheris.hint.mail": "Sales & practice mail",
  "dash.medtheris.hint.chat": "Team channels",
  "dash.medtheris.hint.calendar": "Demos & follow-ups",
  "dash.medtheris.hint.calls": "Video & room history",
  "dash.medtheris.hint.helpdesk": "Zammad · tickets",
  "dash.medtheris.hint.files": "File station",
  "dash.medtheris.hint.office": "Word & Excel in portal",
  "dash.medtheris.hint.crm": "Twenty · pipeline",
  "dash.medtheris.hint.marketing": "Mautic · campaigns",
  "dash.medtheris.hint.sign": "Documenso · contracts",
  "dash.medtheris.hint.aiKnowledge": "Context for mail, tickets, SMS",
  "dash.medtheris.hint.projects": "Issues, board, cycles",

  "dash.kineo.communication.blurb":
    "Group mail, chat, calls, internal support.",
  "dash.kineo.office.blurb": "Documents, partner CRM, signatures.",
  "dash.kineo.project.blurb": "OKRs and initiatives in Plane.",

  "dash.kineo.hint.mail": "Group mailbox",
  "dash.kineo.hint.chat": "Leadership & ops",
  "dash.kineo.hint.calls": "Video & room history",
  "dash.kineo.hint.calendar": "Investor & team meetings",
  "dash.kineo.hint.helpdesk": "Internal & vendor tickets",
  "dash.kineo.hint.files": "File station",
  "dash.kineo.hint.office": "Documents in portal",
  "dash.kineo.hint.crm": "Twenty · partner pipeline",
  "dash.kineo.hint.sign": "Documenso · contracts",
  "dash.kineo.hint.aiKnowledge": "Company context for replies",
  "dash.kineo.hint.projects": "Plane · initiatives",

  "dash.corehub.tip1":
    "The sidebar groups apps into Communication, Office hub and Project hub — as in the product vision.",
  "dash.corehub.tip2":
    "Plane due items appear in the pulse above — click opens SSO into your workspace.",
  "dash.corehub.tip3":
    "Native apps run in the portal; Code/Gitea opens embedded or in a tab.",

  "dash.medtheris.tip1":
    "Helpdesk lives under Communication; CRM, Office and Sign bundle in Office hub.",
  "dash.medtheris.tip2":
    "New leads land in CRM after the scraper run — check the pipeline in Twenty.",
  "dash.medtheris.tip3":
    "Office hub: Word/Excel in portal; slides in the OpenOffice editor via Nextcloud.",

  "dash.kineo.tip1":
    "Three hubs: Communication (mail through helpdesk), Office hub (files & contracts), Project hub (Plane).",
  "dash.kineo.tip2":
    "Video calls and history under Calls; calendar syncs via CalDAV.",
  "dash.kineo.tip3":
    "Project hub for OKRs; CRM for partners; Sign for documented closes.",

  "section.overview": "Overview",
  "section.communication": "Communication",
  "section.officeHub": "Office hub",
  "section.projectHub": "Project hub",
  "section.system": "System",

  "menu.signedInAs": "Signed in as",
  "menu.account": "Account",
  "menu.mfaPassword": "MFA / password",
  "menu.theme": "Theme",
  "menu.language": "Language",
  "menu.refresh": "Refresh session",
  "menu.logout": "Sign out",
  "menu.fullLogout.title":
    "Ends sessions in all apps (Nextcloud, Chat, Code, Plane …) and signs you out afterward.",
  "menu.fullLogout.subtitle": "Recommended when switching users or for test scenarios",
  "menu.fullLogout.action": "Sign out everywhere",
  "menu.logoutPortalOnly.title":
    "Ends only the portal session. App sessions (Nextcloud, Chat …) stay active.",

  "workspace.switcher": "Switch workspace",
  "workspace.search": "Search workspaces …",

  "calendar.newEvent": "New event",
  "calendar.title": "Title",
  "calendar.start": "Start",
  "calendar.end": "End",
  "calendar.location": "Location",
  "calendar.description": "Description",
  "calendar.allDay": "All-day",
  "calendar.today": "Today",
  "calendar.month": "Month",
  "calendar.week": "Week",
  "calendar.day": "Day",
  "calendar.video.add": "Add video call",
  "calendar.video.remove": "Remove video call",
  "calendar.video.label": "Video conference",
  "calendar.video.hint":
    "Generates a Jitsi room and embeds the link in the event (Outlook / Teams style).",
  "calendar.video.join": "Join now",
  "calendar.defaultTitle": "(untitled)",
  "calendar.defaultRoomSlug": "meeting",
  "calendar.sidebar.calendars": "Calendars",
  "calendar.sidebar.loading": "Loading calendars …",
  "calendar.sidebar.noCalendars": "No calendars found.",
  "calendar.sidebar.shared": "shared",
  "calendar.sidebar.browserTz": "Browser time zone",
  "calendar.sidebar.open": "Open sidebar",
  "calendar.sidebar.close": "Close sidebar",
  "calendar.aria.back": "Back",
  "calendar.aria.forward": "Forward",
  "calendar.aria.refresh": "Refresh",
  "calendar.view.label": "View",
  "calendar.view.schedulingTooltip":
    "Free/busy view across multiple people",
  "calendar.view.scheduling": "Scheduling",
  "calendar.moreInMonth": "+{count} more",
  "calendar.allDayAbbrev": "all-day",
  "calendar.delete.confirm": "Delete “{title}”?",
  "calendar.delete.failed": "Delete failed (HTTP {status})",
  "calendar.save.failed": "Save failed (HTTP {status})",
  "calendar.rsvp.failed": "RSVP failed: {message}",
  "calendar.rsvp.accept": "Accept",
  "calendar.rsvp.tentative": "Maybe",
  "calendar.rsvp.decline": "Decline",
  "calendar.rsvp.current": "Current:",
  "calendar.skipOccurrence.confirm":
    "Hide this occurrence from the series?",
  "calendar.drawer.close": "Close",
  "calendar.series.short": "Series",
  "calendar.section.when": "When",
  "calendar.section.yourResponse": "Your response",
  "calendar.section.videoCall": "Video call",
  "calendar.section.attendees": "Attendees",
  "calendar.section.reminders": "Reminders",
  "calendar.section.recurrence": "Recurrence",
  "calendar.section.description": "Description",
  "calendar.section.where": "Location",
  "calendar.remoteTimesForYou":
    "For you: {start}–{end} ({tz})",
  "calendar.recurrence.untilPrefix": "until",
  "calendar.recurrence.countSuffix": "· {count} occurrences",
  "calendar.skipSeriesOccurrence": "Remove this occurrence from series",
  "calendar.delete.action": "Delete",
  "calendar.partstat.accepted": "Accepted",
  "calendar.partstat.declined": "Declined",
  "calendar.partstat.tentative": "Tentative",
  "calendar.partstat.needsAction": "Pending",
  "calendar.partstat.delegated": "Delegated",
  "calendar.partstat.unknown": "—",
  "calendar.reminder.before5": "5 min before",
  "calendar.reminder.before15": "15 min before",
  "calendar.reminder.before30": "30 min before",
  "calendar.reminder.before60": "1 hour before",
  "calendar.reminder.before1d": "1 day before",
  "calendar.reminder.channelEmail": "Email",
  "calendar.reminder.channelPopup": "Popup",
  "calendar.reminder.line": "{when} · {channel}",
  "calendar.recurrence.none": "One-time",
  "calendar.recurrence.daily": "Daily",
  "calendar.recurrence.weekly": "Weekly",
  "calendar.recurrence.biweekly": "Every 2 weeks",
  "calendar.recurrence.monthly": "Monthly",
  "calendar.recurrence.yearly": "Yearly",
  "calendar.recurrence.custom": "Custom",
  "calendar.recurrence.customPattern": "{freq} · every {interval}",
  "calendar.compose.newTitle": "New event",
  "calendar.compose.titlePlaceholder": "What’s on the agenda?",
  "calendar.field.calendar": "Calendar",
  "calendar.field.date": "Date",
  "calendar.field.start": "Start",
  "calendar.field.end": "End",
  "calendar.timesInTimezone": "Times in {tz} ({offset})",
  "calendar.field.locationPlaceholder": "Room, address or link",
  "calendar.field.recurrence": "Recurrence",
  "calendar.field.endsOn": "Ends on",
  "calendar.field.afterNOccurrences": "After N occurrences",
  "calendar.optional": "optional",
  "calendar.reminders.heading": "Reminders",
  "calendar.reminders.none": "No reminders set.",
  "calendar.attendees.label": "Attendees (comma-separated)",
  "calendar.attendees.placeholder":
    "person@example.com, …",
  "calendar.attendees.hint":
    "Attendees receive an invitation with accept/decline buttons (RFC 5545 ATTENDEE/RSVP).",
  "calendar.description.placeholder": "Agenda, notes, links …",
  "calendar.compose.save": "Save",
  "calendar.video.toggleRemove": "Remove",
  "calendar.video.toggleAdd": "Add",
  "calendar.video.testRoom": "Test room",
  "calendar.video.helpWhenOn":
    "Dedicated Jitsi room. The join link is embedded in the event description and as RFC-7986 CONFERENCE for modern clients (Outlook 2024+ / Apple Calendar show a Join button).",
  "calendar.video.helpWhenOff":
    "Adds a new Jitsi room, attaches the join link to the event, and invites everyone via iCal — similar to Outlook/Teams.",
  "calendar.video.copyLink": "Copy link",
  "calendar.sched.title": "Scheduling assistant",
  "calendar.sched.intro":
    "Compares free/busy times for multiple people — click a gap to create an event.",
  "calendar.sched.participantsPlaceholder":
    "Comma-separated people (e.g. mara, someone@example.com)",
  "calendar.sched.duration": "Duration",
  "calendar.sched.from": "from",
  "calendar.sched.to": "to",
  "calendar.sched.workStartTitle":
    "Working hours start — suggestions stay within this window.",
  "calendar.sched.workEndTitle": "Working hours end",
  "calendar.sched.weekendsTitle": "Allow weekend suggestions",
  "calendar.sched.weekendsShort": "WE",
  "calendar.sched.suggestions": "Suggestions ({count})",
  "calendar.sched.more": "More…",
  "calendar.sched.moreTitle": "Show more matching gaps",
  "calendar.sched.slotTitle": "Create event {day} {time}",
  "calendar.sched.noSlot":
    "No shared {minutes}-minute slot in {window}{weekendHint} — switch week, shorten duration, or widen the window.",
  "calendar.sched.weekendIncluded": " (including weekends)",
  "calendar.sched.personColumn": "Person",
  "calendar.sched.youFallback": "You",
  "calendar.sched.minutesShort": "{minutes} min",
  "calendar.sched.selfLive": "you · live",
  "calendar.sched.emptyLanes":
    "Enter people above to see their availability.",

  "theme.light": "Light",
  "theme.dark": "Dark",
  "theme.system": "System",

  "mail.folder.inbox": "Inbox",
  "mail.folder.sent": "Sent",
  "mail.folder.drafts": "Drafts",
  "mail.folder.spam": "Spam",
  "mail.folder.trash": "Trash",
  "mail.folder.archive": "Archive",
  "mail.compose": "New email",
  "mail.compose.to": "To",
  "mail.compose.cc": "Cc",
  "mail.compose.bcc": "Bcc",
  "mail.compose.subject": "Subject",
  "mail.compose.body": "Message",
  "mail.compose.send": "Send",
  "mail.compose.saveDraft": "Save draft",
  "mail.empty.list": "No mails",
  "mail.empty.noSelection": "Pick a mail to read.",
  "mail.markRead": "Mark as read",
  "mail.markUnread": "Mark as unread",
  "mail.delete": "Move to trash",
  "mail.moveTo": "Move to …",
  "mail.settings": "Mail settings (SnappyMail Admin)",
  "mail.bulk.one": "selected",
  "mail.bulk.many": "selected",
  "mail.bulk.visible": "visible",
  "mail.bulk.selectAllVisible": "Select all visible",
  "mail.bulk.clearSelection": "Clear selection",
  "mail.bulk.moveToTrash": "Move to trash",
  "mail.bulk.deleteConfirm":
    "Delete the selected messages? (Messages not already in Trash will be moved there first.)",
  "mail.bulk.partialFail":
    "Some messages could not be deleted. Refresh the list and try again.",
  "mail.reloadFolders": "Reload folders",
  "mail.resize.folderRail": "Resize folder pane",
  "mail.resize.messageList": "Resize message list",
  "mail.mobile.backToList": "Back to message list",
  "mail.folder.aria": "Folders",
  "mail.aiTriage.tooltip":
    "AI sorts the inbox into Today / Reply / FYI / Noise",
  "mail.aiTriage.button": "AI triage",
  "mail.loading.threadList": "Loading messages …",
  "mail.loading.message": "Loading message …",
  "mail.empty.threadSearch": "Nothing found",
  "mail.empty.threadList": "No messages",
  "mail.select.messageHint": "Select a message",
  "mail.row.selectAria": "Select message",
  "mail.row.threadBadgeTitle": "Multi-message conversation",
  "mail.triage.urgent": "Today",
  "mail.triage.needsAction": "Reply",
  "mail.triage.fyi": "FYI",
  "mail.triage.noise": "Noise",
  "mail.reader.backToList": "Back to list",
  "mail.reader.to": "To:",
  "mail.reader.cc": "Cc:",
  "mail.reader.aiReply": "AI reply",
  "mail.reader.asIssue": "As issue",
  "mail.reader.snooze": "Snooze",
  "mail.reader.moreInThread": "More messages in this conversation",
  "mail.noSubject": "(no subject)",
  "mail.noBody": "(no content)",
  "mail.unknownSender": "(unknown)",
  "mail.sendFailed": "Send failed:",
  "mail.quote.header": "On {date}, {name} wrote:\n",
  "mail.compose.attachment": "Attachment",
  "mail.compose.aiWithAi": "With AI",
  "mail.compose.aiDraftTooltip": "Generate draft with AI",
  "mail.compose.aiDraftIntro":
    "Describe what the email should achieve — subject and body are generated.",
  "mail.compose.aiDraftPlaceholder":
    "e.g. first outreach to a physiotherapy practice, short MedTheris intro and suggest a 15‑min demo call.",
  "mail.compose.toneLabel": "Tone:",
  "mail.compose.tone.friendly": "Friendly",
  "mail.compose.tone.formal": "Formal",
  "mail.compose.tone.short": "Brief",
  "mail.compose.aiDraftButton": "Generate draft",
  "mail.compose.recipientsPlaceholder": "recipient@example.com, …",
  "mail.compose.aiDraftFailed": "AI draft failed:",
  "mail.compose.bodyPlaceholder": "Write your message …",
  "mail.snooze.title": "Remind me later",
  "mail.snooze.intro":
    "The email leaves your inbox and returns unread at the time you pick.",
  "mail.snooze.customTime": "Custom time",
  "mail.snooze.submit": "Snooze",
  "mail.snooze.errorMinFuture": "Please pick at least 5 minutes in the future.",
  "mail.snooze.errorInvalidDate": "Invalid date",
  "mail.snooze.preset.inOneHour": "In 1 hour",
  "mail.snooze.preset.todayEvening": "This evening",
  "mail.snooze.preset.tomorrowEvening": "Tomorrow evening",
  "mail.snooze.preset.tomorrowMorning": "Tomorrow morning",
  "mail.snooze.preset.nextMonday": "Next Monday",
  "mail.issue.dialogTitle": "Save as Plane issue",
  "mail.issue.successBody": "Issue created — assigned to you.",
  "mail.issue.openIssueLink": "Open #{n} →",
  "mail.issue.projectLabel": "Project",
  "mail.issue.loadingProjects": "Loading projects …",
  "mail.issue.noProjects": "No projects found in your Plane workspace.",
  "mail.issue.titleLabel": "Title",
  "mail.issue.priorityLabel": "Priority",
  "mail.issue.descIntro": "Description will automatically include:",
  "mail.issue.descBullet1": "Sender, date, subject",
  "mail.issue.descBullet2": "Mail body (truncated to 4000 characters)",
  "mail.issue.descBullet3": "Link back to the email",
  "mail.issue.createButton": "Create",
  "mail.issue.html.fromMail": "From email:",
  "mail.issue.html.date": "Date:",
  "mail.issue.html.subject": "Subject:",
  "mail.issue.html.openOriginal": "Open original email in portal",
  "mail.aiReply.title": "AI reply suggestions",
  "mail.aiReply.knowledgeTooltip": "Knowledge base sections used:",
  "mail.aiReply.knowledgeCountOne": "Knowledge base: 1 section",
  "mail.aiReply.knowledgeCountMany": "Knowledge base: {n} sections",
  "mail.aiReply.intentPlaceholder":
    "Optional: what should the reply say? e.g. confirm Wed 2pm, offer Thu 9am alternative.",
  "mail.aiReply.tone.empathic": "Empathetic",
  "mail.aiReply.generate": "Generate",
  "mail.aiReply.regenerate": "Regenerate",
  "mail.aiReply.notConfiguredIntro": "Tip: Fill in the ",
  "mail.aiReply.knowledgeBase": "Knowledge base",
  "mail.aiReply.notConfiguredOutro": " so the AI understands your company.",
  "mail.aiReply.generating": "Generating suggestions with company knowledge …",
  "mail.aiReply.apply": "Use this",
  "mail.aiReply.subjectLabel": "Subject:",

  "crm.companies": "Companies",
  "crm.people": "People",
  "crm.deals": "Deals",
  "crm.notes": "Notes",
  "crm.tab.activity": "Activity",
  "crm.tab.people": "People",
  "crm.tab.deals": "Deals",
  "crm.tab.details": "Details",
  "crm.empty.companies": "No companies yet. Create the first one.",
  "crm.empty.people": "No people linked.",
  "crm.empty.activity": "No activity yet. Add a note above.",
  "crm.empty.selection":
    "Pick a company on the left to see activity, people, deals and core data.",
  "crm.placeholder.companyName": "Company name · Enter to create",
  "crm.placeholder.search": "Search companies …",
  "crm.scraper": "Run lead scraper",
  "crm.settings": "CRM settings (Twenty)",
  "crm.toolbar.pipelineAll": "Pipeline (all deals)",
  "crm.toolbar.importCsv": "CSV import (companies / people)",
  "crm.toolbar.newCompany": "New company",
  "crm.button.company": "Company",
  "crm.empty.filtered": "No matches with these filters",
  "crm.empty.noCompanySelected": "No company selected",
  "crm.hub.linksTitle": "Links",
  "crm.hub.linksSubtitleWithCompany": "Activity · People · Deals · Details",
  "crm.hub.linksSubtitleEmpty": "Select a company",
  "crm.twenty.nativeTitle": "Native Twenty integration",
  "crm.twenty.createSoonTooltip": "Create in Twenty (coming soon in portal)",
  "crm.bulk.deleteConfirmOne": "Really delete {n} company?",
  "crm.bulk.deleteConfirmMany": "Really delete {n} companies?",
  "crm.alert.saveFailed": "Save failed:",
  "crm.alert.deleteFailed": "Delete failed:",
  "crm.savedView.promptName": "Name for this view:",
  "crm.time.justNow": "just now",
  "crm.time.minutesShort": "{n} min",
  "crm.time.hoursShort": "{n} h",
  "crm.time.daysShort": "{n} d",
  "crm.mautic.noSegments": "No segments configured in Mautic.",
  "crm.person.noEmail": "No email on file",
  "crm.activity.empty": "No activity",
  "crm.feed.noTitle": "(no title)",
  "crm.feed.noName": "(no name)",
  "crm.deals.noOpen": "No open deals.",
  "crm.stats.lastActivity": "last activity {time}",
  "crm.mautic.syncPeopleTitle":
    "Create / update people from “{company}” in Mautic",
  "crm.delete.confirmNamed": "Really delete “{name}”?",
  "crm.bulk.deletePartialFail":
    "{failed} of {total} deletes failed.",
  "crm.alert.createFailed": "Create failed:",
  "crm.alert.pushFailed": "Push failed:",
  "crm.savedView.deleteConfirm": "Delete saved view “{name}”?",
  "crm.loadMore": "Load more…",
  "crm.twenty.hint":
    "For pipelines, custom views and bulk edit, open the full Twenty workspace in a new tab.",
  "crm.stats.noActivityShort": "no activity",
  "crm.savedView.applyTitle": "Apply view",
  "crm.filter.reset": "Reset",
  "crm.openInTwenty": "Open in Twenty",
  "crm.tooltip.closeFilter": "Close filter",
  "crm.tooltip.deleteView": "Delete view",
  "crm.selection.clear": "Clear selection",
  "crm.selection.selectAllVisible": "Select all visible",
  "crm.selection.count": "{count} selected",
  "crm.bulk.setLeadSource": "Set lead source for selection",
  "crm.bulk.setOwner": "Set owner for selection",
  "crm.bulk.deleteSelection": "Delete selection",
  "crm.button.delete": "Delete",
  "crm.push.skippedNoEmail": "{count} skipped (no email)",
  "crm.modal.close": "Close",
  "crm.segment.pickTitle": "Pick segment",
  "crm.segment.select": "Select segment",
  "crm.segment.clickOutsideHint":
    "Tip: click outside the list to cancel",
  "crm.selection.removeRow": "Remove from selection",
  "crm.selection.addRow": "Select",
  "crm.saveChanges": "Save changes",
  "crm.hub.crossAppTitle":
    "Cross-app overview · Mail, tickets, files, projects",
  "crm.section.keyContacts": "Key contacts",
  "crm.changedAt": "Updated {datetime}",
  "crm.sync.summary": "{synced} synced, {skipped} skipped",
  "crm.sync.errorsSuffix": ", {errors} errors",
  "crm.openInMautic": "Open in Mautic",
  "crm.claude.heading": "Claude assessment",
  "crm.channel.pickAgain":
    "Pick a channel and click “Pitch text” again, or",
  "crm.label.add": "Add:",
  "crm.calls.linkedTitle": "Linked with Calls UI",
  "crm.notes.placeholder": "Content (Markdown supported)",
  "crm.modal.closeShort": "Close",
  "crm.scraper.runningSince": "Running since",
  "crm.scraper.triggerIntro":
    "Trigger starts a single scrape run for the given city.",
  "crm.scraper.fullPanelTitle": "Full scraper panel",
  "crm.scraper.running": "Running…",
  "crm.scraper.runningShort": "running",
  "crm.scraper.startingButton": "Starting…",
  "crm.scraper.triggerRun": "Run scrape",
  "crm.scraper.lastRunOkPrefix": "Last run OK · ",
  "crm.scraper.lastRunExitPrefix": "Last run: exit ",
  "crm.scraper.advancedShort": "Advanced",
  "crm.scraper.errorBadge": "Error",
  "crm.scraper.offlineBadge": "offline",
  "crm.scraper.okBadge": "ok",
  "crm.scraper.dryRunCheckbox": "Dry-run (no CRM push)",
  "crm.scraper.cantonOptionalLabel": "Canton (optional)",
  "crm.scraper.cantonPlaceholder": "e.g. BS",
  "crm.scraper.limitLabel": "Limit",
  "crm.savedViews.heading": "Saved views",
  "crm.savedView.saveAsNewTitle": "Save current filters as a new view",
  "crm.filter.phone": "Phone",
  "crm.filter.emailField": "Email",
  "crm.filter.owner": "Owner",
  "crm.filter.booking": "Booking",
  "crm.filter.leadSourceFacet": "Lead source",
  "crm.filter.cityFacet": "City",
  "crm.triState.any": "Any",
  "crm.triState.yes": "Yes",
  "crm.triState.no": "Missing",
  "crm.facet.less": "less",
  "crm.facet.more": "+{count} more",
  "crm.selection.visibleTotal": "{n} visible",
  "crm.push.titleUpsertNoSegment":
    "Upsert selection to Mautic (no segment binding)",
  "crm.push.buttonInFunnel": "To funnel",
  "crm.segment.loading": "Loading segments…",
  "crm.push.resultPushed": "{pushed} pushed to Mautic",
  "crm.push.resultToSegment": " → “{name}”",
  "crm.push.resultErrors": "{errors} errors",
  "crm.bulk.placeholderLeadSource": "Lead source …",
  "crm.bulk.placeholderOwner": "Owner …",
  "crm.bulk.leadSourceShort": "Lead source",
  "crm.bulk.ownerShort": "Owner",
  "crm.leadScore.title": "Lead score: {score} — {desc}",
  "crm.leadScore.desc.hot": "hot — push to funnel",
  "crm.leadScore.desc.warm": "warm — worth triage",
  "crm.leadScore.desc.cold": "cold — data cleanup / enrichment",
  "crm.activityTone.fresh": "Active (< 7 days)",
  "crm.activityTone.warm": "Warm (< 30 days)",
  "crm.activityTone.stale": "Cold (> 30 days)",
  "crm.person.placeholder.name": "Name",
  "crm.person.placeholder.phone": "Phone",
  "crm.person.placeholder.emailGeneral": "General email",
  "crm.company.unnamed": "(unnamed)",
  "crm.nav.backToCrm": "Back to CRM",
  "crm.companyHub.tagline":
    "Company hub · Mail, tickets, files, Sign, and projects",
  "crm.companyHub.phoneShort": "Tel.",
  "crm.companyHub.quickLinksHeading": "Shortcuts",
  "crm.companyHub.tileCrmTitle": "CRM · Detail",
  "crm.companyHub.tileCrmDesc":
    "Open the same company in the three-column CRM.",
  "crm.companyHub.tileMailDescCompose":
    "Start a draft in the portal using the saved address.",
  "crm.companyHub.tileMailDescDomain":
    "Filter the list for “@{domain}” (applied after open).",
  "crm.companyHub.tileMailDescInbox":
    "Open mail — use search manually.",
  "crm.companyHub.tileHelpdeskDesc":
    "Load tickets with the company name as search — refine in the ticket list.",
  "crm.companyHub.tileFilesDescSearch": "Workspace search with “{hint}”.",
  "crm.companyHub.tileFilesDescManual": "Open files — search manually.",
  "crm.companyHub.tileOfficeDesc":
    "Edit templates and text; export PDF from Office and send to Sign.",
  "crm.companyHub.tileSignTitle": "Signature (Sign)",
  "crm.companyHub.tileSignDesc":
    "Upload PDF or bring it from Office — linked to this company for traceability.",
  "crm.companyHub.tileTwentyTitle": "Twenty (raw CRM)",
  "crm.companyHub.tileTwentyDesc": "Native Twenty UI.",
  "crm.pipeline.title": "Deal pipeline",
  "crm.pipeline.subtitle":
    "{workspace} · all opportunities · drag and drop to change stage",
  "crm.pipeline.searchPlaceholder": "Deal or company name…",
  "crm.pipeline.loading": "Loading pipeline…",
  "crm.opportunity.alertDropUnset":
    "Cannot drop into “No stage” — pick a real stage.",
  "crm.opportunity.dragToChangeStage": "Drag to change stage.",
  "crm.opportunity.openInFullCrm": "Open in CRM",
  "crm.opportunity.dropHere": "drop here",
  "crm.opportunity.stageUnset": "No stage",
  "crm.opportunity.emptyBoard": "No deals.",
  "crm.attribution.heading": "Campaign attribution (UTM)",
  "crm.attribution.subheading":
    "Wave 3 — first / last touch stored in /data/marketing-attribution.json",
  "crm.attribution.loading": "Loading…",
  "crm.attribution.empty":
    "No saved UTM data for this company yet. Via POST /api/marketing/attribution (CRM session) or later embedded lead forms / landing pages.",
  "crm.attribution.firstTouch": "First touch",
  "crm.attribution.lastTouch": "Last touch",
  "crm.settingsPage.title": "CRM settings",
  "crm.settingsPage.subtitle":
    "{workspace} · Twenty tenant, members & pipeline",
  "crm.settingsPage.intro":
    "Overview of the Twenty tenant configuration for {workspace}. Custom fields, pipelines and integrations are edited in Twenty for now (buttons below open each area in a new tab).",
  "crm.settingsPage.loadFailed": "Could not load settings",
  "crm.settingsPage.sectionApi": "API connection",
  "crm.settingsPage.linkApiKeysTwenty": "API keys in Twenty",
  "crm.settingsPage.apiReachable": "reachable",
  "crm.settingsPage.apiUnreachable": "not reachable",
  "crm.settingsPage.labelTwentyWorkspaceId": "Twenty workspace ID",
  "crm.settingsPage.labelPublicUrl": "Public URL",
  "crm.settingsPage.labelComposeUrl": "Compose URL",
  "crm.settingsPage.kpiPipelineStages": "Pipeline stages",
  "crm.settingsPage.sectionMembers": "Workspace members",
  "crm.settingsPage.linkEditInTwenty": "Edit in Twenty",
  "crm.settingsPage.membersEmpty":
    "No members found — the API token may be too narrow, or only the bridge user is active in the workspace.",
  "crm.settingsPage.sectionPipeline": "Pipeline (deals by stage)",
  "crm.settingsPage.linkDataModel": "Data model",
  "crm.settingsPage.pipelineIntroPrefix":
    "Align stages with sales before you build a large Kanban (see playbook ",
  "crm.settingsPage.pipelineIntroSuffix":
    "). The chart below only reflects existing deals.",
  "crm.settingsPage.pipelineEmpty":
    "No deals recorded yet. Define pipeline stages in the CRM and move opportunities between them.",
  "crm.settingsPage.sectionLeadSources": "Lead sources",
  "crm.settingsPage.leadSourcesEmpty": "No lead sources recorded.",
  "crm.settingsPage.sectionIntegrations": "Integrations",
  "crm.settingsPage.integrationMauticTitle": "Marketing (Mautic)",
  "crm.settingsPage.integrationMauticSubtitle":
    "Bridge token, segments, campaigns",
  "crm.settingsPage.integrationTwentyTitle": "Twenty integrations",
  "crm.settingsPage.integrationTwentySubtitle":
    "Webhooks, API keys, external data sources",
  "crm.importCsvModal.title": "CSV import",
  "crm.importCsvModal.subtitleCompanies":
    "Import companies from CSV into Twenty CRM",
  "crm.importCsvModal.subtitlePeople":
    "Import people / contacts from CSV into Twenty CRM — deduped by email",
  "crm.importCsvModal.entityPeople": "People",
  "crm.importCsvModal.entityCompanies": "Companies",
  "crm.importCsvModal.formatHint":
    "Tip: HubSpot / Pipedrive / Excel columns are detected automatically.",
  "crm.importCsvModal.uploadCsv": "Upload CSV",
  "crm.importCsvModal.previewBusy": "Building preview…",
  "crm.importCsvModal.totalsRows": "rows",
  "crm.importCsvModal.totalsValid": "valid",
  "crm.importCsvModal.totalsSkipped": "skipped",
  "crm.importCsvModal.sepComma": "Comma (,)",
  "crm.importCsvModal.sepSemicolon": "Semicolon (;)",
  "crm.importCsvModal.sepTab": "Tab",
  "crm.importCsvModal.autoCreateCompanies": "Auto-create missing companies",
  "crm.importCsvModal.mappingHeading": "Column mapping",
  "crm.importCsvModal.columnEmpty": "(empty)",
  "crm.importCsvModal.thNum": "#",
  "crm.importCsvModal.thCompanyName": "Name",
  "crm.importCsvModal.thDomain": "Domain",
  "crm.importCsvModal.thCity": "City",
  "crm.importCsvModal.thIndustry": "Industry",
  "crm.importCsvModal.thPersonName": "First / last name",
  "crm.importCsvModal.thEmail": "Email",
  "crm.importCsvModal.thCompany": "Company",
  "crm.importCsvModal.thJobTitle": "Job title",
  "crm.importCsvModal.thStatus": "Status",
  "crm.importCsvModal.resultCompaniesSuffix": "companies created.",
  "crm.importCsvModal.resultPeopleSuffix": "people created.",
  "crm.importCsvModal.skippedSummary":
    "{count} skipped (e.g. existing email).",
  "crm.importCsvModal.errorsSummary":
    "{count} failed — details:",
  "crm.importCsvModal.errorsRowPrefix": "Row",
  "crm.importCsvModal.footerReady": "{count} valid rows ready",
  "crm.importCsvModal.footerPrompt": "Paste CSV or upload a file",
  "crm.importCsvModal.runCount": "Import {count}",
  "crm.importCsvModal.running": "Importing…",
  "crm.importCsvModal.delimiterDetected": "Delimiter:",
  "crm.importCsvModal.field.ignore": "Ignore",
  "crm.importCsvModal.field.companyName": "Name",
  "crm.importCsvModal.field.domainName": "Domain",
  "crm.importCsvModal.field.industry": "Industry",
  "crm.importCsvModal.field.phone": "Phone",
  "crm.importCsvModal.field.address": "Address",
  "crm.importCsvModal.field.city": "City",
  "crm.importCsvModal.field.country": "Country",
  "crm.importCsvModal.field.arr": "Revenue (ARR)",
  "crm.importCsvModal.field.employees": "Employees",
  "crm.importCsvModal.field.linkedinUrl": "LinkedIn",
  "crm.importCsvModal.field.xUrl": "Twitter / X",
  "crm.importCsvModal.field.notes": "Notes",
  "crm.importCsvModal.field.firstName": "First name",
  "crm.importCsvModal.field.lastName": "Last name",
  "crm.importCsvModal.field.fullName": "Full name",
  "crm.importCsvModal.field.email": "Email",
  "crm.importCsvModal.field.jobTitle": "Job title",
  "crm.importCsvModal.field.company": "Company",
  "crm.mautic.badgeDetailed":
    "Mautic @{domain}: {count} contacts. Segments: {segments}. Stage: {stage}",
  "crm.mautic.badgeSimpleOne": "In Mautic: 1 contact @{domain}",
  "crm.mautic.badgeSimpleMany": "In Mautic: {hits} contacts @{domain}",
  "crm.quick.call": "Call",
  "crm.quick.videoCall": "Video call",
  "crm.quick.mail": "Mail",
  "crm.quick.note": "Note",
  "crm.quick.task": "Task",
  "crm.quick.companyHub": "Company hub",
  "crm.quick.mailToPortal": "Mail {email} (in portal)",
  "crm.call.subjectWithCompany": "Call with {name}",
  "crm.quick.callNumber": "Call {phone}",
  "crm.quick.mailTo": "Mail {email}",
  "crm.icp.label": "Ideal Customer",
  "crm.section.contact": "Contact",
  "crm.section.classification": "Classification",
  "crm.section.timeline": "Timeline",
  "crm.people.leadTherapistSection": "Lead therapist",
  "crm.people.therapistsColumn": "Therapists",
  "crm.people.keyStaffTitle": "Therapists / staff",
  "crm.notes.titlePlaceholder": "Note title",
  "crm.ai.classifyFailedHeading": "Classification failed",
  "crm.timeline.created": "Created {datetime}",
  "crm.timeline.updated": "Updated {datetime}",
  "crm.field.ownerMail": "Owner email",
  "crm.field.icp": "ICP",
  "crm.field.tenant": "Tenant",
  "crm.marketing.loadingData": "Loading Mautic data…",
  "crm.marketing.apiNotConfigured": "Mautic is not configured.",
  "crm.marketing.credentialsMissing": "(MAUTIC_API_USERNAME/_TOKEN missing)",
  "crm.marketing.contactsLine": "Mautic contacts{suffix}",
  "crm.marketing.segmentTooltip": "{count} contacts in “{name}”",
  "crm.marketing.pointsAbbrev": "{n} pts",
  "crm.sidebar.marketing": "Marketing",
  "crm.ai.leadButton": "AI lead",
  "crm.ai.classifyTooltip": "AI classify (Claude)",
  "crm.ai.nextStepLabel": "Next step",
  "crm.ai.salesBriefTooltip":
    "Generate AI sales brief (website + news + workspace knowledge)",
  "crm.ai.salesBriefModalHeading": "AI sales brief",
  "crm.ai.salesBriefButton": "Sales brief",
  "crm.ai.briefFailedHeading": "Brief failed",
  "crm.ai.websiteOkBadge": "Website OK",
  "crm.ai.knowledgeBadge": "Knowledge",
  "crm.ai.copyToClipboard": "Copy to clipboard",
  "crm.ai.copied": "✓ copied",
  "crm.ai.regenerate": "Regenerate",
  "crm.ai.pitchTooltip":
    "AI pitch text for the channel (email · LinkedIn · …)",
  "crm.ai.pitchButton": "Pitch text",
  "crm.ai.channelLabel": "Channel",
  "crm.ai.pitchEmptyHint":
    "Pick a channel and click “Pitch text” again, or use “Regenerate”.",
  "crm.pitch.cold_email": "Cold email",
  "crm.pitch.linkedin": "LinkedIn",
  "crm.pitch.followup": "Follow-up",
  "crm.pitch.call_opener": "Call opener",
  "crm.scraper.launcherHeading": "Lead scraper",
  "crm.stat.openDeals": "Open deals",
  "crm.stat.contacts": "Contacts",
  "crm.stat.lastContact": "Last contact",
  "crm.stat.openTasks": "Open tasks",
  "crm.stat.tasksFromTotal": "of {total}",
  "crm.stat.tasksAllDone": "All done",
  "crm.inlineEdit.saveTooltip": "Save changes",
  "crm.inlineEdit.editFieldsTooltip": "Edit name · phone · email",
  "crm.section.activeDeals": "Active deals",
  "crm.details.practiceSection": "Practice master data",
  "crm.details.addressSection": "Address",
  "crm.field.specialization": "Specialization",
  "crm.field.languages": "Languages",
  "crm.field.street": "Street",
  "crm.field.zipCity": "ZIP / city",
  "crm.field.country": "Country",
  "crm.field.leadName": "Name",

  "helpdesk.tickets": "Tickets",
  "helpdesk.scope.all": "All",
  "helpdesk.scope.mine": "Mine",
  "helpdesk.scope.unassigned": "Unassigned",
  "helpdesk.filter.open": "Open",
  "helpdesk.filter.closed": "Closed",
  "helpdesk.filter.all": "All",
  "helpdesk.status.new": "New",
  "helpdesk.status.open": "Open",
  "helpdesk.status.pending": "Pending",
  "helpdesk.status.closed": "Closed",
  "helpdesk.status.merged": "Merged",
  "helpdesk.priority.low": "Low",
  "helpdesk.priority.normal": "Normal",
  "helpdesk.priority.high": "High",
  "helpdesk.priority.urgent": "Urgent",
  "helpdesk.empty.mine": "No tickets for you.",
  "helpdesk.empty.allAssigned": "Everything assigned.",
  "helpdesk.empty.open": "No open tickets.",
  "helpdesk.empty.generic": "No tickets.",
  "helpdesk.newTicket": "New ticket",
  "helpdesk.reply": "Reply",
  "helpdesk.internalNote": "Internal note",
  "helpdesk.assignee": "Assignee",
  "helpdesk.group": "Group",
  "helpdesk.settings": "Settings (groups, senders, channels)",
  "helpdesk.slaRisk": "SLA risk",
  "helpdesk.slaRisk.title": "Show only tickets with SLA under 60 minutes or breached",
  "helpdesk.stats.open": "Open",
  "helpdesk.stats.slaAtRisk": "SLA at risk",
  "helpdesk.stats.closedToday": "Closed today",
  "helpdesk.stats.capped": "partial count — see Zammad for very large queues",
  "helpdesk.composer.answerTab": "Reply",
  "helpdesk.composer.internalTab": "Internal note",
  "helpdesk.composer.sendShortcut": "⌘/Ctrl + Enter to send",
  "helpdesk.composer.solutionLabel": "Internal resolution (optional, for the record)",
  "helpdesk.composer.solutionPlaceholder":
    "Briefly note what was resolved — saved as an internal note.",
  "helpdesk.composer.placeholderReply": "Reply to customer…",
  "helpdesk.composer.placeholderNote": "Internal note — not visible to customer.",
  "helpdesk.composer.statusAfterSend": "Status after send",
  "helpdesk.composer.saveNote": "Save note",
  "helpdesk.customer.crm": "CRM",
  "helpdesk.customer.crmTitle": "Open person in Twenty CRM",
  "helpdesk.channel.email": "Email",
  "helpdesk.channel.phone": "Phone",
  "helpdesk.channel.web": "Web / portal",
  "helpdesk.channel.note": "Note",
  "helpdesk.channel.sms": "SMS",
  "helpdesk.channel.chat": "Chat",
  "helpdesk.channel.twitter": "Twitter / X",
  "helpdesk.channel.facebook": "Facebook",
  "helpdesk.channel.other": "Channel",
  "helpdesk.import.csvTitle": "Import tickets from CSV",
  "helpdesk.conversation.title": "Conversation",
  "helpdesk.conversation.pickTicket": "Select a ticket",
  "helpdesk.portalLink.mintTitle":
    "Create a signed magic link for the customer and copy it to the clipboard.",
  "helpdesk.portalLink.button": "Magic link",
  "helpdesk.portalLink.copied": "Copied",
  "helpdesk.portalLink.copiedToast": "Magic link copied (valid 30 days).",
  "helpdesk.portalLink.prompt": "Copy magic link:",
  "helpdesk.portalLink.manualCopied": "Magic link created (copy manually).",
  "helpdesk.empty.noTicket": "No ticket selected",
  "helpdesk.empty.noTicketHint":
    "Pick a ticket on the left to see the thread and reply composer.",
  "helpdesk.empty.noMessages": "No messages.",
  "helpdesk.empty.zammadTitle": "Native Zammad integration",
  "helpdesk.empty.zammadHint":
    "Handle tickets, reply, and add internal notes — right in the portal.",
  "helpdesk.error.loadTicket": "Failed to load ticket",
  "helpdesk.error.createTicket": "Failed to create ticket",
  "helpdesk.error.save": "Failed to save",
  "helpdesk.error.send": "Failed to send",
  "helpdesk.error.tagAdd": "Failed to add tag",
  "helpdesk.error.tagRemove": "Failed to remove tag",
  "helpdesk.error.portalLink": "Magic link failed",
  "helpdesk.error.macro": "Macro failed",
  "helpdesk.error.bulk": "Bulk update failed",
  "helpdesk.bulk.partialFail": "could not be updated",
  "helpdesk.card.mine": "Mine",
  "helpdesk.card.selectBulk": "Select for bulk actions",
  "helpdesk.card.noTitle": "(no title)",
  "helpdesk.card.unread": "Unread",
  "helpdesk.crm.twentyLabel": "Twenty CRM",
  "helpdesk.newTicket.subjectPh": "Subject…",
  "helpdesk.newTicket.bodyPh": "Description (optional)",
  "helpdesk.newTicket.cancel": "Cancel",
  "helpdesk.newTicket.submit": "Create",
  "helpdesk.composer.templates": "Templates",
  "helpdesk.composer.templatesTitle": "Insert template",
  "helpdesk.composer.attachmentSoon": "Attachment (coming soon)",
  "helpdesk.composer.attachment": "Attachment",
  "helpdesk.customer.videoCall": "Video call",
  "helpdesk.customer.mailAction": "Mail",
  "helpdesk.customer.profile360": "360°",
  "helpdesk.customer.profileTitle": "Open customer profile (360°)",
  "helpdesk.customer.unknown": "Unknown contact",
  "helpdesk.article.agent": "Agent",
  "helpdesk.sla.firstResponse": "First response",
  "helpdesk.sla.closeDeadline": "Close",
  "helpdesk.sla.breached": "SLA breached",
  "helpdesk.sla.pill": "SLA",
  "helpdesk.sla.due": "due:",
  "helpdesk.sla.panel.first": "First response",
  "helpdesk.sla.panel.close": "Resolution",
  "helpdesk.sla.panel.none": "No active SLA.",
  "helpdesk.time.justNow": "just now",
  "helpdesk.time.mins": "min",
  "helpdesk.time.hours": "h",
  "helpdesk.time.days": "d",
  "helpdesk.drawer.ticketsTotal": "Tickets total",
  "helpdesk.drawer.customerSince": "Customer since",
  "helpdesk.drawer.history": "Ticket history",
  "helpdesk.drawer.noTickets": "No tickets.",
  "helpdesk.drawer.writeEmail": "Write email",
  "helpdesk.drawer.title": "Customer profile",
  "helpdesk.drawer.close": "Close (Esc)",
  "helpdesk.conversation.articlesCount": "#{number} · {count} articles",
  "helpdesk.sidebar.statusAssignment": "Status & assignment",
  "helpdesk.detail.customerInternalNoteHeading":
    "Internal note on customer card",
  "helpdesk.detail.historyTickets": "History · {count} tickets",
  "helpdesk.detail.createdAt": "Created {datetime}",
  "helpdesk.detail.updatedAt": "Updated {datetime}",
  "helpdesk.detail.lastContactAt": "Last contact {datetime}",
  "helpdesk.header.shortcutsTooltip": "Show keyboard shortcuts (?)",
  "helpdesk.header.shortcutsLabel": "Shortcuts",
  "helpdesk.openInZammad": "Open in Zammad",
  "helpdesk.ai.tooltipWithKb":
    "AI reply suggestions using company knowledge base",
  "helpdesk.ai.tooltipReplyOnly":
    "No customer message — AI reply only on the reply tab",
  "helpdesk.ai.replyToggle": "AI reply",
  "helpdesk.ai.closeAria": "Close",
  "helpdesk.bulk.selectedCount": "{count} selected",
  "helpdesk.bulk.selectAllVisible": "Select all ({total})",
  "helpdesk.bulk.clearSelection": "Clear selection",
  "helpdesk.bulk.optionStatus": "Status…",
  "helpdesk.bulk.optionPriority": "Priority…",
  "helpdesk.bulk.optionGroup": "Group…",
  "helpdesk.bulk.optionAssignee": "Assignee…",
  "helpdesk.bulk.unassign": "— unassign —",
  "helpdesk.bulk.apply": "Apply",
  "helpdesk.field.assignee": "Assignee",
  "helpdesk.macro.menuTitle": "Apply macro",
  "helpdesk.macro.setsPrefix": "Sets:",
  "helpdesk.filter.viewsLabel": "Views:",
  "helpdesk.filter.zammadViewTitle": "Zammad view: {name}",
  "helpdesk.filter.moreCount": "+{count} more",
  "helpdesk.filter.less": "less",
  "helpdesk.tags.add": "Add tag",
  "helpdesk.tags.remove": "Remove tag",
  "helpdesk.composer.solutionHtmlHeading": "Solution / closure (internal)",
  "helpdesk.canned.title": "Reply templates",
  "helpdesk.canned.browserOnly": "(local, this browser only)",
  "helpdesk.canned.new": "New template",
  "helpdesk.canned.none": "No templates.",
  "helpdesk.canned.namePlaceholder": "e.g. “Standard greeting”",
  "helpdesk.canned.bodyPlaceholder": "Hello {{customer.firstname}}, …",
  "helpdesk.canned.placeholderHint":
    "Tip: placeholders like {{customer.firstname}} are replaced by triggers later — inserted as static text for now.",
  "helpdesk.canned.pickPrompt":
    "Pick a template on the left to edit or create a new one.",
  "helpdesk.shortcuts.title": "Keyboard shortcuts",
  "helpdesk.shortcuts.focusSearch": "Focus search",
  "helpdesk.shortcuts.nextPrev": "Next / previous ticket",
  "helpdesk.shortcuts.newTicket": "New ticket",
  "helpdesk.shortcuts.replyComposer": "Reply to ticket (composer)",
  "helpdesk.shortcuts.assignMe": "Assign to me",
  "helpdesk.shortcuts.bulkMark": "Mark current ticket for bulk",
  "helpdesk.shortcuts.toggleOverlay": "Toggle this overlay",
  "helpdesk.shortcuts.closeOverlay": "Close drawer / overlay",
  "helpdesk.shortcuts.sendReply": "Send reply",

  "helpdesk.settings.backTitle": "Back to Helpdesk",
  "helpdesk.settings.title": "Helpdesk settings",
  "helpdesk.settings.subtitle": "{workspace} · groups, outbound addresses & email channels",
  "helpdesk.settings.loadError": "Could not load settings",
  "helpdesk.settings.introBefore": "Configuration for",
  "helpdesk.settings.introAfter":
    ". Groups, members, outbound addresses and email channels (IMAP/SMTP) are managed directly here — actions write straight back to the helpdesk core. Connection tests before saving prevent broken mailbox setups.",
  "helpdesk.settings.groupsTitle": "Groups",
  "helpdesk.settings.groupsEmptyBefore":
    "No groups are configured for this workspace. Create them in Zammad admin and add them under",
  "helpdesk.settings.groupsEmptyAfter": "in your `.env`.",
  "helpdesk.settings.emailsTitle": "Outbound addresses",
  "helpdesk.settings.emailsAdd": "Add address",
  "helpdesk.settings.emailsEmpty":
    "No outbound addresses configured. Add one above to answer tickets from that address.",
  "helpdesk.settings.channelsTitle": "Email channels (inbox / outbound)",
  "helpdesk.settings.channelsAdd": "Add channel",
  "helpdesk.settings.channelsNeedGroup": "At least one group is required",
  "helpdesk.settings.channelsNewHint": "Set up a new IMAP/SMTP channel",
  "helpdesk.settings.channelsEmpty":
    "No email channels yet. Click “Add channel” above to configure IMAP/SMTP access.",
  "helpdesk.settings.tenantTitle": "Tenant configuration",
  "helpdesk.settings.tenantWorkspace": "Workspace",
  "helpdesk.settings.tenantGroups": "Allowed Zammad groups",
  "helpdesk.settings.tenantEnvHint": "Configured via",
  "helpdesk.settings.tenantEnvSuffix": "in the server `.env`.",
  "helpdesk.settings.channelDeleteConfirm":
    "Delete channel {id}? Incoming mail will no longer be fetched.",
  "helpdesk.settings.emailDeleteConfirm":
    "Delete outbound address “{email}”? Tickets keep their history, but new mail can no longer be sent from this address.",
  "helpdesk.settings.channelId": "Channel {id}",
  "helpdesk.settings.active": "active",
  "helpdesk.settings.inactive": "inactive",
  "helpdesk.settings.edit": "Edit",
  "helpdesk.settings.activate": "Enable",
  "helpdesk.settings.deactivate": "Disable",
  "helpdesk.settings.pause": "Pause",
  "helpdesk.settings.delete": "Delete",
  "helpdesk.settings.inboundShort": "Inbound (IMAP/POP3)",
  "helpdesk.settings.outboundShort": "Outbound (SMTP)",
  "helpdesk.settings.notConfigured": "not configured",
  "helpdesk.settings.noFields": "— no fields —",
  "helpdesk.settings.protocol": "Protocol",
  "helpdesk.settings.encryption": "Encryption",
  "helpdesk.settings.ssl993": "SSL/TLS (993)",
  "helpdesk.settings.starttls143": "STARTTLS (143)",
  "helpdesk.settings.encryptionNone": "None",
  "helpdesk.settings.host": "Host",
  "helpdesk.settings.port": "Port",
  "helpdesk.settings.user": "User",
  "helpdesk.settings.password": "Password",
  "helpdesk.settings.folder": "Folder",
  "helpdesk.settings.behavior": "Behavior",
  "helpdesk.settings.keepOnServer": "Keep messages on server",
  "helpdesk.settings.outboundSection": "Outbound (SMTP)",
  "helpdesk.settings.smtpExternal": "SMTP (external)",
  "helpdesk.settings.sendmailLocal": "Sendmail (local)",
  "helpdesk.settings.starttls587": "STARTTLS (587)",
  "helpdesk.settings.ssl465": "SSL/TLS (465)",
  "helpdesk.settings.inboundSection": "Inbound (inbox)",
  "helpdesk.settings.senderBlock": "Outbound address (also created as sender)",
  "helpdesk.settings.displayName": "Display name",
  "helpdesk.settings.memberCountOne": "{n} member",
  "helpdesk.settings.memberCountMany": "{n} members",
  "helpdesk.settings.defaultSender": "Default sender:",
  "helpdesk.settings.groupDefaultMailbox": "Default outbound",
  "helpdesk.settings.noteLabel": "Note:",
  "helpdesk.settings.noneOption": "— none —",
  "helpdesk.settings.status": "Status",
  "helpdesk.settings.groupActiveLabel": "Group active (incoming tickets allowed)",
  "helpdesk.settings.noteField": "Note",
  "helpdesk.settings.notePlaceholder": "Internal description of the group",
  "helpdesk.settings.members": "Members",
  "helpdesk.settings.loadMembers": "Load members",
  "helpdesk.settings.noAgents": "No agents in this group.",
  "helpdesk.settings.pickAgent": "— select an agent —",
  "helpdesk.settings.addMember": "Add",
  "helpdesk.settings.removeFromGroup": "Remove from group",
  "helpdesk.settings.emailDisplayNameShort": "Display name:",
  "helpdesk.settings.otherWorkspace": "other workspace",
  "helpdesk.settings.emailDisplayNameFull": "Display name (real name in mailbox)",
  "helpdesk.settings.placeholderSupportName": "e.g. Acme Support",
  "helpdesk.settings.emailActiveLabel": "Address active (sending allowed)",
  "helpdesk.settings.emailAddTitle": "Add outbound address",
  "helpdesk.settings.emailAddSubtitle": "Email address used to answer tickets.",
  "helpdesk.settings.create": "Create",
  "helpdesk.settings.emailField": "Email address",
  "helpdesk.settings.channelBinding": "Channel binding (optional)",
  "helpdesk.settings.channelBindingNone": "— no channel (send only via global SMTP) —",
  "helpdesk.settings.channelPick": "Channel {id} ({area})",
  "helpdesk.settings.channelBindingHint":
    "A channel defines IMAP inbox + SMTP outbound. Without a channel you can only send — incoming mail to this address will not become tickets.",
  "helpdesk.settings.placeholderEmail": "support@example.com",
  "helpdesk.settings.channelModalTitle": "Set up email channel",
  "helpdesk.settings.channelModalSubtitle":
    "Inbox via IMAP/POP3 + outbound via SMTP. Connection is checked before saving.",
  "helpdesk.settings.testConnection": "Test connection",
  "helpdesk.settings.noGroupsOption": "— no groups available —",
  "helpdesk.settings.groupSelectLabel": "Group (incoming tickets land here)",
  "helpdesk.settings.overridePasswords":
    "Overwrite passwords (otherwise keep existing)",
  "helpdesk.settings.testShort": "Test",
  "helpdesk.settings.name": "Name",
  "helpdesk.settings.inboundLabel": "Inbound",
  "helpdesk.settings.outboundLabel": "Outbound",
  "helpdesk.settings.refreshTitle": "Refresh",
  "helpdesk.settings.inboundColon": "Inbound:",
  "helpdesk.settings.outboundColon": "Outbound:",
  "helpdesk.settings.testOk": "OK",

  "office.word.group.history": "History",
  "office.word.undo": "Undo (Cmd/Ctrl+Z)",
  "office.word.redo": "Redo (Cmd/Ctrl+Shift+Z)",
  "office.word.group.style": "Style",
  "office.word.styleAria": "Style",
  "office.word.paragraph": "Normal",
  "office.word.h1": "Heading 1",
  "office.word.h2": "Heading 2",
  "office.word.h3": "Heading 3",
  "office.word.h4": "Heading 4",
  "office.word.group.start": "Home",
  "office.word.bold": "Bold",
  "office.word.italic": "Italic",
  "office.word.underline": "Underline",
  "office.word.strike": "Strikethrough",
  "office.word.highlight": "Highlight",
  "office.word.inlineCode": "Inline code",
  "office.word.clearFormat": "Clear formatting",
  "office.word.group.lists": "Lists",
  "office.word.bulletList": "Bullet list",
  "office.word.orderedList": "Numbered list",
  "office.word.taskList": "Task list",
  "office.word.quote": "Quote",
  "office.word.group.align": "Alignment",
  "office.word.alignLeft": "Align left",
  "office.word.alignCenter": "Center",
  "office.word.alignRight": "Align right",
  "office.word.alignJustify": "Justify",
  "office.word.group.insert": "Insert",
  "office.word.insertLink": "Insert link",
  "office.word.promptUrl": "URL:",
  "office.word.insertImage": "Insert image",
  "office.word.uploadFailed": "Image upload failed.",
  "office.word.insertTable": "Insert table (3×3)",
  "office.word.insertSigField": "Insert signature field",
  "office.word.promptSigLabel": "Signature field label (e.g. “Client”):",
  "office.word.sigDefault": "Signature",
  "office.word.group.font": "Font",
  "office.word.fontSize": "Font size",
  "office.word.promptFontPt": "Font size in pt (8–48):",
  "office.word.group.find": "Find",
  "office.word.findReplace": "Find / replace (Cmd/Ctrl+F)",
  "office.word.group.merge": "Mail merge",
  "office.word.mergeFromCrm": "Mail merge: generate letters from CRM companies",
  "office.word.wordsTitle": "Words",
  "office.word.wordsCount": "{n} words",
  "office.word.wordsCountOne": "1 word",
  "office.word.mergePanelHint":
    "Click inserts the token at the cursor in the document",
  "office.word.mergeSelectVisible": "Select visible",
  "office.word.mergeClose": "Close",
  "office.word.findNext": "Next match (Enter)",
  "office.word.findClose": "Close (Esc)",

  "office.sheet.undo": "Undo (Cmd/Ctrl+Z)",
  "office.sheet.paste": "Paste (Cmd/Ctrl+V)",
  "office.sheet.alignLeft": "Align left",
  "office.sheet.alignRight": "Align right",
  "office.sheet.currencyChf": "Currency CHF",
  "office.sheet.clearFormat": "Clear format",
  "office.sheet.insertGroup": "Insert",
  "office.sheet.rowAbove": "Insert row above",
  "office.sheet.rowBelow": "Insert row below",
  "office.sheet.rowDelete": "Delete row",
  "office.sheet.colLeft": "Insert column left",
  "office.sheet.colRight": "Insert column right",
  "office.sheet.colDelete": "Delete column",
  "office.sheet.textLengthRule": "Text length",
  "office.sheet.pickColTitle": "Select column {col}",
  "office.sheet.pickRowTitle": "Select row {row}",
  "office.sheet.filterActiveTitle": "Active filter — click to change",
  "office.sheet.adjustHeightTitle": "Adjust height",
  "office.sheet.reset": "Reset",
  "office.sheet.findNextTitle": "Next match (Enter)",
  "office.sheet.closeTitle": "Close (Esc)",
  "office.sheet.tabsHelpTitle":
    "Double-click: rename · Right-click: menu · Drag to reorder",
  "office.sheet.sheetDelete": "Delete",
  "office.sheet.sheetCloseAria": "Close",
  "office.sheet.cfAddRule": "Add rule",
  "office.sheet.cfHeatMap": "Heat map (red → green)",
  "office.sheet.cfHeatMapHint": "Low red, middle yellow, high green.",
  "office.sheet.cfBlueOrangeHint": "Blue low, white mid, orange high.",
  "office.sheet.cfPositiveGreen": "Positive values green",
  "office.sheet.cfPositiveGreenHint": "Highlights cells > 0 in green.",
  "office.sheet.paletteWhite": "White",
  "office.sheet.paletteLightGreen": "Light green",
  "office.sheet.paletteGreen": "Green",

  "cmdk.dialogAria": "Global search",
  "cmdk.placeholder":
    "Companies, people, deals, sign, marketing, tickets, files, Plane, integrations …",
  "cmdk.closeEsc": "Close (Esc)",
  "cmdk.noResults": "No results.",
  "cmdk.tipsTitle": "Tips:",
  "cmdk.tipScopes":
    "Companies, people, CRM deals, Documenso, Mautic contacts, Zammad, Nextcloud, Plane; with an empty query you see recent integration/webhook activity",
  "cmdk.tipNavigate": "↑↓ to move, ↩ to open, Esc to close",
  "cmdk.tipShortcut": "⌘/Ctrl+K opens search from anywhere",
  "cmdk.groupCompanies": "Companies",
  "cmdk.groupPeople": "People",
  "cmdk.groupDeals": "Deals",
  "cmdk.groupSign": "Sign",
  "cmdk.groupMarketing": "Marketing",
  "cmdk.groupFiles": "Files",
  "cmdk.groupPlane": "Plane",
  "cmdk.enterOpen": "open",
  "cmdk.escapeCloseLabel": "close",
  "cmdk.footerGlobalSearch": "global search",
  "cmdk.groupHelpdesk": "Helpdesk",
  "cmdk.groupIntegration": "Recent integrations",

  "calls.preflight.title": "Microphone / camera unavailable",
  "calls.preflight.hint.denied.step1Before": "Click the",
  "calls.preflight.hint.denied.step1Icon": "lock icon",
  "calls.preflight.hint.denied.step1After": "to the left of the URL.",
  "calls.preflight.hint.denied.step2": "Set Microphone and Camera to Allow.",
  "calls.preflight.hint.denied.step3": "Reload the page, then click “Check again”.",
  "calls.preflight.checkAgain": "Check again",
  "calls.preflight.unsupported":
    "Your browser does not support microphone/camera access. Please use Chrome, Edge or Firefox.",
  "calls.preflight.denied":
    "Microphone or camera was blocked. Allow access in the address bar (lock icon) and try again.",
  "calls.preflight.noDevice":
    "No microphone or camera found. Make sure a headset or webcam is connected.",
  "calls.preflight.inUse":
    "Microphone/camera is already in use by another app (Zoom, Teams, OBS …). Close that app and try again.",
  "calls.preflight.insecure":
    "Calls only work over HTTPS or localhost. Switch to a secure URL.",
  "calls.preflight.unknown":
    "Could not initialize microphone/camera. Please try again.",
  "calls.jitsi.invalidUrl": "Invalid call URL",
  "calls.jitsi.externalApiMissing": "JitsiMeetExternalAPI not available",
  "calls.jitsi.openInTab": "Open in new tab",
  "calls.jitsi.grantTitle": "Allow microphone & camera",
  "calls.jitsi.grantHint":
    "Click the lock icon in the address bar, allow microphone and camera, then retry here.",
  "calls.jitsi.retry": "Try again",
  "calls.jitsi.fallbackIframeWithMessage":
    "External API: {message} — iframe fallback.",
  "calls.jitsi.fallbackIframe": "External API failed — iframe fallback.",

  "admin.onboarding.scraper.pushConfirmCanton":
    "Profile {profile}: push all unpushed cache entries from canton {canton} to CRM now?",
  "admin.onboarding.scraper.pushConfirmAll":
    "Profile {profile}: push all unpushed cache entries to CRM?",
  "admin.onboarding.scraper.profilePlaceholder": "Pick a profile — the rest of the form adapts.",
  "admin.onboarding.scraper.limitLabel": "Limit (max entries)",
  "admin.onboarding.scraper.skipDuplicates": "skip",
  "admin.onboarding.scraper.skipDuplicatesHint":
    "Default: only empty fields are filled — existing data is never overwritten.",
  "admin.onboarding.scraper.llmDisabled": "LLM extraction is already disabled for this profile",
  "admin.onboarding.scraper.oneClickHint":
    "One click = one run. While the subprocess runs the button stays disabled.",
  "admin.onboarding.scraper.running": "Running…",
  "admin.onboarding.scraper.preflightIncomplete": "Incomplete configuration: {missing}",
  "admin.onboarding.scraper.trigger": "Run scraper",
  "admin.onboarding.scraper.bannerIncomplete": "Incomplete configuration — see banner above.",
  "admin.onboarding.scraper.bannerRunning": "A run is in progress — please wait.",
  "admin.onboarding.scraper.phaseProcess": "Processing entries",
  "admin.onboarding.scraper.chooseProfileBanner": "Choose profile",
  "admin.onboarding.scraper.reconnectBanner": "Runner unreachable — automatic reconnect active",
  "admin.onboarding.scraper.jobRunningBanner": "A scraper job is running",
  "admin.onboarding.scraper.stallHint": "Note: no new line for over {seconds} s.",
  "admin.onboarding.scraper.chooseProfileCta": "Select profile",
  "admin.onboarding.scraper.specialtiesHint":
    "Select at least one specialty — otherwise discovery is aborted (no search queries).",
  "admin.onboarding.scraper.cronPlaceholder": "e.g. Physio ZH — daily 05:30 UTC",
  "admin.onboarding.scraper.cacheDryRunHint":
    "Entries the scraper found and enriched during a dry-run or aborted run.",
  "admin.onboarding.scraper.cacheEmptyCta":
    "Cache is empty for this profile — start a first run above.",
  "admin.onboarding.scraper.pushFooter":
    "Push only uploads unpushed entries — no detail calls, no LLM tokens, no web crawls.",
  "admin.onboarding.scraper.cacheEmptyDone": "Cache is empty or fully in CRM.",
  "admin.onboarding.scraper.pushAll": "Push all {n} unpushed entries",
  "admin.onboarding.scraper.preflightRunning": "Pre-flight for {profile} is running …",
  "admin.onboarding.scraper.retryCheck": "Check again",
  "admin.onboarding.scraper.recheck": "recheck",
  "admin.onboarding.scraper.triggerBlocked": "{profile}: incomplete configuration — trigger locked",
  "admin.onboarding.scraper.envHint":
    "Add missing secrets in `/opt/corelab/.env` and redeploy scraper runner.",

  "admin.onboarding.leads.pickSegmentMerge":
    "Pick a Mautic segment above before merging.",
  "admin.onboarding.leads.mergeFailed": "Merge failed: {message}",
  "admin.onboarding.leads.pickSegmentCheck":
    "Pick a Mautic segment above before starting the final check.",
  "admin.onboarding.leads.optionChoose": "— choose —",
  "admin.onboarding.leads.mauticOffline": "Mautic offline — merge disabled.",
  "admin.onboarding.leads.emptyNewHint":
    "No web-form leads in NEW. Check PUBLIC_LEAD_FORM_SECRET, POST /api/public/lead and the Twenty workspace.",
  "admin.onboarding.leads.pickLead": "Pick a lead on the left to review.",
  "admin.onboarding.leads.noneToReview": "No leads to review.",
  "admin.onboarding.leads.mergePushesEmails":
    "Merge upserts everyone with email at the company into",
  "admin.onboarding.leads.mergeToFunnel": "Merge → funnel",
  "admin.onboarding.leads.confirmTitle": "Final check — merge to funnel",
  "admin.onboarding.leads.step3Confirm": "③ Confirm",
  "admin.onboarding.leads.checkRequired": "Check required signals for",
  "admin.onboarding.leads.forceContinueWarn":
    "match — only continue manually after review.",
  "admin.onboarding.leads.confirmMergeQuestion":
    "Merge {name} into Mautic segment “{segment}” now?",
  "admin.onboarding.leads.undoHint":
    "You can undo this by adjusting the opportunity in Twenty again — Mautic contacts remain.",
  "admin.onboarding.leads.back": "Back",
  "admin.onboarding.leads.confirmBlockedTitle": "Confirmation required",
  "admin.onboarding.leads.confirmBlockedMissing": "Address and website must be present",
  "admin.onboarding.leads.mergeNow": "Merge now",



  "sign.documents": "Signatures",
  "sign.status.draft": "Drafts",
  "sign.status.pending": "Pending",
  "sign.status.completed": "Completed",
  "sign.status.rejected": "Rejected",
  "sign.scope.all": "All",
  "sign.upload": "Upload",
  "sign.send": "Send",
  "sign.empty.list": "No documents.",
  "sign.empty.selection": "Pick a document or upload a new one.",

  "sign.notConfiguredDefault": "Sign is not configured for this workspace.",
  "sign.error.invalidResponse": "Invalid server response.",
  "sign.actionFailed": "Action failed",
  "sign.visibilityChangeFailed": "Could not change visibility",
  "sign.deleteConfirm": "really delete?",
  "sign.deleteFailed": "Delete failed",
  "sign.upload.convertedNamed": "\"{name}\" was converted to PDF and uploaded. Assign recipients and fields in the editor.",
  "sign.upload.plainNamed": "\"{name}\" was uploaded. Assign recipients and fields in the editor.",
  "sign.time.justNow": "just now",
  "sign.time.minsAgo": "{n} min ago",
  "sign.time.hoursAgo": "{n} h ago",
  "sign.time.daysAgo": "{n} d ago",
  "sign.salesFlow.title": "Sales flow (short)",
  "sign.salesFlow.step1Title": "1. Draft",
  "sign.salesFlow.step1Body": "Upload PDF (or export from Office). Fields & recipients in the editor.",
  "sign.salesFlow.step2Title": "2. For signature",
  "sign.salesFlow.step2Body": "Send; recipients get a Documenso email.",
  "sign.salesFlow.step3Title": "3. Done",
  "sign.salesFlow.step3Body": "Archive PDF (Documenso).",
  "sign.crmLinkActive": "CRM link active: uploads use Documenso",
  "sign.companyHub": "Open company hub",
  "sign.upload.teamCheckbox": "Visible to everyone on this workspace in the Sign list (default:",
  "sign.upload.onlyMe": "only me",
  "sign.upload.formatsTitle": "PDF, DOCX, ODT, RTF, TXT, etc. — non-PDFs are converted automatically",
  "sign.upload.uploading": "Uploading…",
  "sign.upload.documentButton": "Upload document",
  "sign.manageInDocumenso": "Manage in Documenso",
  "sign.autoPdfFooter": "Word, ODT & more are converted to PDF automatically",
  "sign.search.placeholder": "Search titles…",
  "sign.list.oneDoc": "1 document",
  "sign.list.nDocs": "{n} documents",
  "sign.notConfigured.title": "Sign not set up yet",
  "sign.notConfigured.provision": "Provision now",
  "sign.empty.noMatch": "No matches",
  "sign.empty.noDocuments": "No documents yet",
  "sign.empty.hintOtherSearch": "Try a different search term.",
  "sign.empty.hintCreateDocumenso": "Create the first document here or in Documenso.",
  "sign.empty.hintUploadSidebar": "Upload a document in the left sidebar or wait for shared documents.",
  "sign.detail.emptyNativeTitle": "Native sign integration",
  "sign.detail.emptyNativeHint": "Once a Documenso team is configured for this workspace, documents appear here.",
  "sign.detail.pickDocumentTitle": "No document selected",
  "sign.detail.pickDocumentHint": "Choose a document on the left for status, recipients, and actions — or create a new one.",
  "sign.openInDocumenso": "Open in Documenso",
  "sign.chunkSignWorkspace": "Sign ·",
  "sign.row.privateListed": "Listed only for you in CoreLab",
  "sign.row.stalledHint": "Unchanged for days — a reminder often helps.",
  "sign.row.signedProgress": "signed",
  "sign.row.lastActivity": "Last activity",
  "sign.signingStatus.pending": "Pending",
  "sign.signingStatus.signed": "Signed",
  "sign.signingStatus.rejected": "Rejected",
  "sign.emailStatus.sent": "Email sent",
  "sign.emailStatus.notSent": "Email not sent",
  "sign.sales.nextDraft": "Next: open “Fields & recipients in the editor”, then send for signature.",
  "sign.sales.nextPending": "Next: wait for signatures — remind if needed.",
  "sign.sales.nextCompleted": "Done — download the PDF below or open in Documenso.",
  "sign.sales.nextRejected": "Rejected — create a new document or check details in Documenso.",
  "sign.detail.progressAllSigned": "All recipients have signed",
  "sign.detail.signedProgressLine": "{signed} of {total} signers have signed",
  "sign.detail.progressOneRejected": "At least one recipient rejected",
  "sign.detail.progressDraft": "Draft — not sent yet",
  "sign.detail.createdOn": "Created",
  "sign.detail.completedOn": "Completed",
  "sign.detail.stalledText": "without movement. A short personal reminder usually helps a lot.",
  "sign.detail.stalledLead": "This document has been idle since",
  "sign.detail.smtpWarningTitle": "Invitation email for the current round not sent yet.",
  "sign.detail.smtpWarningBody": "At least one signer who should be up now shows “Email not sent”. Often: SMTP/settings in Documenso, sender domain/DNS, spam folder — or copy the personal link below / use Remind.",
  "sign.detail.sequentialTitle": "Signing order is on.",
  "sign.detail.sequentialBody": "Recipients who go later often stay on “Email not sent” in Documenso until earlier steps finish — that’s expected. Once the previous step is done, sending continues; otherwise check SMTP in Documenso.",
  "sign.detail.preflightTitle": "Signature fields missing in Documenso.",
  "sign.detail.preflightBody": "At least one “Signature” field per signer on the PDF is required before you can send.",
  "sign.detail.preflightMissingFor": "Missing for:",
  "sign.detail.preflightEditorStrong": "Fields & recipients in the editor",
  "sign.detail.preflightSendStrong": "Send",
  "sign.detail.preflightInstructionBefore": "Open",
  "sign.detail.preflightInstructionMid":
    ", place fields on the PDF, then click",
  "sign.detail.preflightInstructionEnd": ".",
  "sign.detail.portalRef": "Portal reference:",
  "sign.detail.pdfView": "View PDF",
  "sign.detail.pdfViewTitle": "Open PDF in a new tab (via portal — no separate Documenso login).",
  "sign.detail.pdfExplainer": "The preview is the base PDF (e.g. text from Word/mail-merge). Signature, date, and editor fields are Documenso overlays — signatures and filled dates appear here once recipients sign (or in the completed archive PDF).",
  "sign.detail.editorButton": "Fields & recipients in the editor",
  "sign.detail.sendDirect": "Send now",
  "sign.detail.sendDirectTitleOk": "Sends the signing email with the team’s default template.",
  "sign.detail.sendDirectTitleBlocked": "Place signature fields in the editor first.",
  "sign.detail.withMessage": "With message…",
  "sign.detail.sendMessageTitleOk": "Enter subject and personal message before sending.",
  "sign.detail.sendMessageTitleBlocked": "Set signature fields in the editor first.",
  "sign.detail.remindAll": "Remind all",
  "sign.detail.remindAllTitle": "Resend the signing email to everyone who hasn’t signed yet.",
  "sign.detail.remindMessageTitle": "Send reminder with a personalized message.",
  "sign.detail.archivePdf": "Archive PDF",
  "sign.detail.archivePdfTitle": "Save signed PDF (archive)",
  "sign.detail.repeatSend": "Send again",
  "sign.detail.repeatSendTitle": "Creates a new draft copy with the same recipients. Signed fields must be set again in the editor.",
  "sign.detail.openDraft": "Open draft",
  "sign.detail.openDetail": "Open detail",
  "sign.detail.delete": "Delete",
  "sign.detail.recipientsWithCount": "Recipients ({n})",
  "sign.detail.recipients": "Recipients",
  "sign.detail.orderHelp": "Number = signing order (lower first). “Email not sent” for later steps is often normal.",
  "sign.detail.parallelHelp": "∥ = no fixed order — invitations in parallel.",
  "sign.detail.noRecipientsYet": "No recipients assigned yet.",
  "sign.sidebar.listCoreLab": "List (CoreLab)",
  "sign.sidebar.privateVisible": "Visible only in your Sign area",
  "sign.sidebar.teamVisible": "For everyone with workspace access",
  "sign.sidebar.onlyMe": "Only me",
  "sign.sidebar.team": "Team",
  "sign.sidebar.listNote": "Applies only to the CoreLab Sign list, not visibility inside Documenso.",
  "sign.sidebar.listReadOnly": "Editable only for documents uploaded via the portal.",
  "sign.sidebar.source": "Source",
  "sign.sidebar.sourceUpload": "Direct upload",
  "sign.sidebar.sourceTemplate": "Template",
  "sign.sidebar.sourceTemplateDirect": "Template (direct link)",
  "sign.sidebar.visibility": "Visibility",
  "sign.sidebar.visTeam": "Team",
  "sign.sidebar.visManager": "Manager+",
  "sign.sidebar.visAdmin": "Admin",
  "sign.sidebar.timestamps": "Timestamps",
  "sign.sidebar.created": "Created",
  "sign.sidebar.updated": "Updated",
  "sign.sidebar.completed": "Completed",
  "sign.sidebar.owner": "Owner",
  "sign.sidebar.progress": "Progress",
  "sign.sidebar.signedFraction": "signed",
  "sign.recipient.stepTitle": "Signing step {n}",
  "sign.recipient.parallelTitle": "Parallel — no fixed order",
  "sign.recipient.opened": "Opened",
  "sign.recipient.copyLinkTitle": "Copy personal signing link to clipboard",
  "sign.recipient.link": "Link",
  "sign.recipient.remindTitle": "Send another signing email to {email}.",
  "sign.recipient.remind": "Remind",
  "sign.recipient.messageTitle": "Include a personal message for {email}.",
  "sign.prompt.copySignLink": "Copy signing link:",
  "sign.compose.sendNow": "Send now",
  "sign.compose.remindSend": "Send reminder",
  "sign.compose.headlineSend": "Send document",
  "sign.compose.headlineRemindOne": "Reminder for {email}",
  "sign.compose.headlineRemindAll": "Reminder for all pending",
  "sign.compose.introSend": "Optional subject and personal message — if empty, Documenso uses the team’s default template.",
  "sign.compose.introRemind": "Sent in addition to the standard reminder.",
  "sign.compose.subjectLabel": "Subject (optional)",
  "sign.compose.subjectPlaceholder": "e.g. “{title}” — please sign",
  "sign.compose.messageLabel": "Message (optional)",
  "sign.compose.messagePlaceholder": "Hi, could you take a quick look? Thanks!",
  "sign.role.SIGNER": "SIGNER",
  "sign.role.APPROVER": "APPROVER",
  "sign.role.VIEWER": "VIEWER",
  "sign.role.CC": "CC",
  "sign.role.ASSISTANT": "ASSISTANT",
  "sign.editor.field.signature": "Signature",
  "sign.editor.field.initials": "Initials",
  "sign.editor.field.date": "Date",
  "sign.editor.field.text": "Text",
  "sign.editor.field.name": "Name",
  "sign.editor.field.hint.signature": "Recipient’s signature",
  "sign.editor.field.hint.initials": "Short mark in multiple places",
  "sign.editor.field.hint.date": "Filled automatically when signing",
  "sign.editor.field.hint.text": "Free-text field",
  "sign.editor.field.hint.name": "Documenso fills the recipient name (prefer over plain text)",
  "sign.editor.persistEmpty": "Documenso returned no fields after save — likely API/permission. Check the network tab or retry.",
  "sign.editor.alert.needRecipient": "At least one recipient is required.",
  "sign.editor.alert.validEmail": "Each recipient needs a valid email.",
  "sign.editor.alert.needSignature": "Please add for:",
  "sign.editor.alert.fieldRecipientMismatch": "Some fields aren’t assigned to a saved recipient. Choose “Save recipients” then “Send” again.",
  "sign.editor.confirm.removeRecipient": "Remove recipient \"{name}\" and all assigned fields?",
  "sign.editor.recipientSave": "Save recipients",
  "sign.editor.send": "Send",
  "sign.editor.resend": "Send again",
  "sign.editor.recipientsHeading": "Recipients",
  "sign.editor.addRecipientTitle": "Add recipient",
  "sign.editor.noRecipients": "No recipients yet. Click “+” or add below.",
  "sign.editor.role.approver": "Approver",
  "sign.editor.shortcuts": "Arrow keys = nudge · Del = delete",
  "sign.editor.removeFieldAria": "Remove field",
  "sign.editor.activeFor": "Active for:",
  "sign.editor.workflowStrong": "Send workflow:",
  "sign.editor.workflowBody": "When you click “Send”, we save recipients, persist any unsaved fields, and distribute the document via the Documenso API (recipient emails incl. signing link).",
  "sign.editor.placeOnPdf": "Click the PDF to place a field",
  "sign.editor.sendFailed": "Send failed",
  "sign.editor.missingSigIntro": "Documenso requires at least one “Signature” field per signer. Date, text, or initials alone are not enough. Please add for:",
  "sign.editor.placeFieldsLead": "Place fields",
  "sign.editor.fieldsCountOne": "1 field",
  "sign.editor.fieldsCountMany": "{n} fields",
  "sign.editor.mobileHint": "Tip: place fields on a desktop — drag handles are tiny on mobile.",
  "sign.editor.recipientsCountOne": "1 recipient",
  "sign.editor.recipientsCountMany": "{n} recipients",
  "sign.editor.trayHeading": "Fields",
  "sign.editor.trayHint":
    "Drag a field type into the document, or pick a type and click the page.",
  "sign.editor.loadingPdf": "Loading PDF…",
  "sign.editor.fieldOverlayTitle":
    "{label} · {name} (drag to move, arrow keys to nudge)",
  "sign.editor.toolbarHints":
    "Drag & drop · click a field to move or resize ·",
  "sign.editor.placeholder.name": "Name",
  "sign.editor.placeholder.email": "Email",
  "sign.editor.removeRecipientTitle": "Remove",
  "sign.editor.orderTitle": "Order",
  "sign.editor.roleOption.signer": "Signer",
  "sign.editor.roleOption.viewer": "Viewer",
  "sign.editor.pdfDownloadFailed": "PDF download failed ({status})",
  "sign.editor.pageIndicator": "Page {current} / {total}",


  "pane.mobile.backToList": "Back to list",
  "pane.sidebar.expand": "Expand sidebar",
  "pane.sidebar.collapse": "Collapse sidebar",
  "pane.sidebar.toggleAria": "Toggle sidebar",
  "pane.sidebar.showTitle": "Show sidebar",
  "pane.splitter.resizeWidth": "Adjust width",
  "pane.sidebar.dragResize": "Resize sidebar",

  "calls.title": "Calls",
  "calls.newCall": "New call",
  "calls.active": "Active",
  "calls.history": "History",
  "calls.empty.list": "No calls",
  "calls.empty.selection": "Pick a call or start a new one.",
  "calls.composer.subject": "Subject",
  "calls.composer.start": "Start call",
  "calls.composer.title": "Start a new call",
  "calls.composer.subjectPlaceholder": "e.g. Sales demo · Example Clinic",
  "calls.composer.contextLabel": "Context",
  "calls.composer.unlinkTitle": "Remove link",
  "calls.composer.contextHint":
    "Tip: Click-to-call from CRM, helpdesk or chat opens this composer with context prefilled.",
  "calls.list.header.active": "Active calls",
  "calls.list.header.all": "All calls",
  "calls.search.placeholder": "Search subject, participants…",
  "calls.alert.startFailed": "Could not start call: ",
  "calls.alert.endFailed": "Could not end call: ",
  "calls.defaultSubject": "Ad hoc call",
  "calls.empty.filtered.title": "No calls in this filter.",
  "calls.empty.filtered.hint": "Start a new call or change the filter.",
  "calls.selection.title": "Pick a call",
  "calls.selection.hint":
    "Choose one from the list, or click “New call” to start a room.",
  "calls.context.crmContact": "CRM contact",
  "calls.context.chatRoom": "Chat room",
  "calls.context.projectIssue": "Project issue",
  "calls.context.adhoc": "Ad hoc call",
  "calls.context.ticket": "Ticket",
  "calls.detail.join": "Join",
  "calls.detail.openNewTab": "Open in new tab",
  "calls.detail.endCall": "End call",
  "calls.detail.ended": "Ended",
  "calls.detail.startedBy": "started by {name}",
  "calls.detail.durationLabel": "Duration",
  "calls.detail.endedWithDuration": "Call ended · Duration {duration}",
  "calls.detail.section.participants": "Participants",
  "calls.detail.section.context": "Context",
  "calls.detail.section.room": "Room",
  "calls.detail.online": "online",
  "calls.detail.noParticipantsYet": "No one has joined yet.",
  "calls.detail.copyInviteTitle": "Copy invite link",
  "calls.detail.copyLink": "Copy link",
  "calls.detail.adhocNoLink": "Ad hoc call without a linked record.",
  "calls.meeting.backToList": "List",
  "calls.meeting.leave": "Leave meeting",
  "calls.meeting.maximize": "Maximize meeting",
  "calls.meeting.minimize": "Minimize (list / chat usable)",
  "calls.meeting.openNewTab": "Open in new tab",
  "calls.meeting.copyInvite": "Copy invite link",
  "calls.meeting.listBackTooltip": "{label} (meeting keeps running)",
  "calls.conn.qualityTitle": "Connection quality: {q}/100",
  "calls.conn.good": "Good",
  "calls.conn.ok": "OK",
  "calls.conn.poor": "Poor",
  "calls.stage.activeParticipantsTitle": "{count} active participants",
  "calls.stage.ariaActiveCall": "Active call",
  "calls.stage.pipSubtitleActive": "{count} active",
  "calls.confirm.endForEveryone": "End call for everyone?",
  "calls.shell.backTooltip": "Back to list (call keeps running in background)",
  "calls.incoming.portalTitle": "Incoming portal call",
  "calls.incoming.chatVoiceShort": "Voice call",
  "calls.incoming.chatVideoShort": "Video call",
  "calls.incoming.chatVoiceLong": "Voice call (chat)",
  "calls.incoming.chatVideoLong": "Video call (chat)",
  "calls.incoming.dismissTitle": "Dismiss",
  "calls.incoming.accept": "Answer",
  "calls.incoming.acceptHereSuffix": " (here)",
  "calls.incoming.openInWindow": "Open in window",
  "calls.incoming.popupWindow": "Popup window",
  "calls.incoming.chatOnlyLink": "Chat only",
  "calls.incoming.chatOnlyButton": "Go to chat only",
  "calls.incoming.jitsiLink": "Jitsi",
  "calls.incoming.jitsiNewWindow": "Jitsi (new window)",
  "calls.incoming.allowDesktopNotify":
    "Allow desktop notifications (when tab is hidden)",
  "calls.incoming.footerSignedInPrefix": "Signed in as {email}. ",
  "calls.incoming.footerHint":
    "Portal and chat calls share the same meeting surface.",
  "calls.incoming.tabTitlePrefix": "Call:",

  "chat.createMenuTitle": "Create",
  "chat.newChannel": "New channel",
  "chat.newDm": "New direct message",
  "chat.channelsSection": "Channels",
  "chat.channelsEmpty": "No channels match this search.",
  "chat.dmSection": "Direct messages",
  "chat.dmEmpty": "No direct messages yet",
  "chat.refreshRooms": "Refresh",
  "chat.sidebarResizeAria": "Resize sidebar",
  "chat.pickRoomHint": "Pick a channel or person",
  "chat.backToChannelListAria": "Back to channel list",
  "chat.generalChannel": "General",
  "chat.privateAria": "Private",
  "chat.lastActivePrefix": "Last active:",
  "chat.videoCallTitle": "Video call (Jitsi)",
  "chat.video": "Video",
  "chat.voiceCallTitle": "Voice call (audio only)",
  "chat.tel": "Tel",
  "chat.filesTitle": "Files in this channel",
  "chat.files": "Files",
  "chat.channelSettings": "Channel settings",
  "chat.loadingMessages": "Loading messages…",
  "chat.noMessagesYet": "No messages yet. Say hello!",
  "chat.dropFileHint": "Drop a file here to send it",
  "chat.removeAttachmentTitle": "Remove attachment",
  "chat.captionPlaceholder": "Optional caption…",
  "chat.messageTo": "Message to {name}",
  "chat.sendTitle": "Send (Enter)",
  "chat.composerHintDesktop": "Enter to send · Shift + Enter for newline",
  "chat.composerHintMobile": "Tap Send to send · newline for multi-line",
  "chat.alert.uploadFailed": "File upload failed: ",
  "chat.alert.sendFailed": "Send failed: ",
  "chat.alert.startCallFailed": "Could not start call.",
  "chat.defaultMeetingSubject": "Meeting",
  "chat.drawer.closeTitle": "Close",
  "chat.drawer.closeAria": "Close",
  "chat.tab.members": "Members",
  "chat.tab.files": "Files",
  "chat.tab.settings": "Settings",
  "chat.members.confirmRemove": "Remove @{username} from this channel?",
  "chat.members.removeTooltip": "Remove @{username}",
  "chat.members.forbiddenRemove":
    "Not allowed. Only owners/moderators can remove members.",
  "chat.members.invite": "Invite member",
  "chat.members.loading": "Loading members…",
  "chat.members.none": "No members yet",
  "chat.members.ownerAria": "Owner",
  "chat.members.moderator": "Moderator",
  "chat.members.member": "Member",
  "chat.members.inviteModalTitle": "Invite member",
  "chat.members.errorStatus": "Error {status}",
  "chat.members.inviteForbidden":
    "Not allowed. Only owners/moderators can invite.",
  "chat.members.userNotFound": "@{username} was not found in chat.",
  "chat.members.searchPlaceholder": "Name or @username",
  "chat.members.searching": "Searching…",
  "chat.members.noResults": "No one found",
  "chat.files.loading": "Loading files…",
  "chat.files.empty": "No files shared yet.",
  "chat.files.channelCountOne": "{count} file in channel",
  "chat.files.channelCountMany": "{count} files in channel",
  "chat.files.loadingLabel": "Loading files…",
  "chat.files.emptyDetail":
    "Attach via the paperclip in the composer or drag a file into chat.",
  "chat.settings.sectionDescription": "Description",
  "chat.settings.topicPlaceholder": "What is this channel about?",
  "chat.settings.discard": "Discard",
  "chat.settings.save": "Save",
  "chat.settings.visibility": "Visibility",
  "chat.settings.private": "Private",
  "chat.settings.public": "Public",
  "chat.settings.privateHint": "Only invited members can see this channel.",
  "chat.settings.publicHint":
    "Anyone in the workspace can see and join this channel.",
  "chat.settings.visibilityConfirm":
    "Set this channel to {target}? Existing members stay.",
  "chat.settings.visibilityPublicWord": "public",
  "chat.settings.visibilityPrivateWord": "private",
  "chat.settings.toggleVisibility": "Set to {target}",
  "chat.settings.archiveConfirm":
    "Archive this channel? It stays available but is no longer active.",
  "chat.settings.archive": "Archive",
  "chat.settings.restricted":
    "Only owners and moderators can change channel settings.",
  "chat.inviteOnlySidebarHint":
    "Only invited members can see the channel and its content.",
  "chat.sidebar.emptyTeamsLine1": "No team channels in {workspace}.",
  "chat.sidebar.emptyTeamsLine2":
    "You can start a direct message from the lower right.",
  "chat.team.noChannelsYet": "No channels yet",
  "chat.settings.dangerZone": "Danger zone",
  "chat.settings.archiveHint":
    "Archived channels are hidden but not deleted. A workspace admin can reactivate them.",

  "chat.newDmModal.title": "Find someone",
  "chat.newDmModal.placeholder": "Name or @username",
  "chat.newDmModal.searching": "Searching …",
  "chat.newDmModal.noResults": "No one found",

  "chat.newChannelModal.title": "New channel in {workspace}",
  "chat.newChannelModal.nameLabel": "Name",
  "chat.newChannelModal.namePlaceholder": "e.g. kineo-retail",
  "chat.newChannelModal.slugSavedAsPrefix": "Will be saved as",
  "chat.newChannelModal.topicLabel": "Description (optional)",
  "chat.newChannelModal.topicPlaceholder": "What is this channel about?",
  "chat.newChannelModal.teamLabel": "Team (optional)",
  "chat.newChannelModal.noTeamOption": "— No team —",
  "chat.newChannelModal.teamHint":
    "Teams group related channels in the sidebar.",
  "chat.newChannelModal.publicHint":
    "Everyone in {workspace} can join and read messages.",
  "chat.newChannelModal.createButton": "Create channel",
  "chat.newChannelModal.errorMinLength": "Name must be at least 2 characters",
  "chat.newChannelModal.errorDuplicateName":
    "A channel with this name already exists.",
  "chat.newChannelModal.errorGeneric": "Error {status}",

  "chat.bubble.meetingLink": "Meeting link",
  "chat.bubble.fileFallback": "File",
  "chat.bubble.attachmentFallback": "Attachment",

  "chat.invite.pastVoiceSelf": "Past voice call",
  "chat.invite.pastVideoSelf": "Past video call",
  "chat.invite.pastVoiceOther": "Missed voice call",
  "chat.invite.pastVideoOther": "Missed video call",
  "chat.invite.activeVoice": "Voice call",
  "chat.invite.activeVideo": "Video call",
  "chat.invite.sameRoomParen": "({count}× same room)",
  "chat.invite.join": "Join",
  "chat.invite.linkLabel": "Link",
  "chat.invite.historySameRoomPrefix": "{count}× same room, ",
  "chat.invite.when.today": "{hm}",
  "chat.invite.when.yesterday": "Yesterday {hm}",
  "chat.invite.when.sameDayRange": "{start}–{end}",

  "chat.overlay.chromeTitleVoice": "Voice call (team)",
  "chat.overlay.chromeTitleVideo": "Video call (team)",
  "chat.overlay.endCall": "End call",
  "chat.overlay.participantFallback": "Participant",
  "chat.overlay.jitsiAppSuffix": "Team call",

  "projects.view.board": "Board",
  "projects.view.backlog": "Backlog",
  "projects.view.sprints": "Sprints",
  "projects.view.roadmap": "Roadmap",
  "projects.view.list": "List",
  "projects.newIssue": "New issue",
  "projects.newProject": "New project",
  "projects.empty.list": "No projects.",
  "projects.empty.selection": "Pick a project.",
  "projects.import": "Import",
  "projects.import.title": "Import issues from CSV",
  "projects.import.description":
    "Bulk-creates issues in the current project from a CSV file. Jira, Linear and Plane columns are detected automatically — adjust any unmapped column below.",
  "projects.import.upload": "Upload CSV",
  "projects.import.paste": "or paste it here…",
  "projects.import.delimiter": "Delimiter",
  "projects.import.delimiter.auto": "auto-detect",
  "projects.import.preview": "Preview",
  "projects.import.mapping": "Column mapping",
  "projects.import.mapping.column": "Column",
  "projects.import.mapping.field": "Field",
  "projects.import.field.ignore": "Ignore",
  "projects.import.field.name": "Title",
  "projects.import.field.description": "Description",
  "projects.import.field.state": "Status",
  "projects.import.field.priority": "Priority",
  "projects.import.field.assignee": "Assignee",
  "projects.import.field.labels": "Labels",
  "projects.import.field.startDate": "Start date",
  "projects.import.field.targetDate": "Due date",
  "projects.import.field.estimatePoint": "Estimate",
  "projects.import.totals.rows": "rows",
  "projects.import.totals.valid": "valid",
  "projects.import.totals.skipped": "skipped",
  "projects.import.totals.unmapped": "unknown labels",
  "projects.import.autoLabels": "Auto-create missing labels",
  "projects.import.run": "Import",
  "projects.import.running": "Importing…",
  "projects.import.done": "{count} issues imported.",
  "projects.import.failed": "{count} rows failed.",
  "projects.import.empty": "No CSV loaded yet.",
  "projects.import.help.jira":
    "Tip: In Jira → Filter → ‘Export → CSV (all fields)’ produces a directly compatible file.",
  "projects.delete.action": "Delete project",
  "projects.delete.confirm":
    "Delete this project permanently? All issues and data in Plane for this project will be lost.",
  "projects.delete.failed": "Could not delete project: ",
  "projects.settings.lead":
    "You can manage issues, boards and cycles here. For profile settings and Plane’s full UI, open Plane — same SSO mapping as elsewhere in the workspace.",
  "projects.settings.link.portalViews": "Portal view (board, backlog …)",
  "projects.settings.link.planeHub": "Plane hub · Shortcuts",
  "projects.settings.link.openPlane": "Open Plane (SSO bridge)",
  "projects.settings.link.profile": "Plane profile & account settings",
  "projects.settings.instance": "Instance",
  "projects.settings.crumbSettings": "Settings",

  "projects.priority.urgent": "Urgent",
  "projects.priority.high": "High",
  "projects.priority.medium": "Medium",
  "projects.priority.low": "Low",
  "projects.priority.none": "None",
  "projects.stateGroup.backlog": "Backlog",
  "projects.stateGroup.unstarted": "To do",
  "projects.stateGroup.started": "In progress",
  "projects.stateGroup.completed": "Done",
  "projects.stateGroup.cancelled": "Cancelled",
  "projects.issueType.story": "Story",
  "projects.issueType.task": "Task",
  "projects.issueType.bug": "Bug",
  "projects.issueType.epic": "Epic",
  "projects.issueType.subtask": "Sub-task",
  "projects.cycle.current": "Active",
  "projects.cycle.upcoming": "Planned",
  "projects.cycle.completed": "Completed",
  "projects.cycle.draft": "Draft",
  "projects.groupBy.status": "Status",
  "projects.groupBy.assignee": "Assignee",
  "projects.groupBy.priority": "Priority",
  "projects.groupBy.type": "Issue type",
  "projects.groupBy.epic": "Epic / module",
  "projects.board.groupBy": "Group by:",
  "projects.board.quickFilter": "Quick filter:",
  "projects.board.quickFilterReset": "reset",
  "projects.board.assigneeFilterTitle": "Only issues for {name}",
  "projects.board.doneFraction": "{done} / {total}",
  "projects.board.doneWord": "done",
  "projects.board.assignedCount": "{n} assigned",
  "projects.board.completedRatio": "{done} / {total}",
  "projects.board.createPlaceholder": "What needs to be done?",
  "projects.board.createIssue": "Create issue",
  "projects.sprint.noWindow": "No date range",
  "projects.sprint.closed": "completed",
  "projects.sprint.noEnd": "no end date",
  "projects.sprint.overdueDays": "{n} days overdue",
  "projects.sprint.endsToday": "ends today",
  "projects.sprint.oneDayLeft": "1 day left",
  "projects.sprint.daysLeft": "{n} days left",
  "projects.column.nobody": "Unassigned",
  "projects.column.unknownEpic": "Unknown epic",
  "projects.column.noEpic": "No epic",
  "projects.stat.issues": "Issues",
  "projects.stat.done": "Done",
  "projects.stat.inProgress": "In progress",
  "projects.stat.points": "Story points",
  "projects.sprints.header": "Sprints",
  "projects.sprints.newTooltip": "New sprint",
  "projects.sprints.namePh": "Sprint name…",
  "projects.sprints.cancel": "Cancel",
  "projects.sprints.create": "Create",
  "projects.sprints.empty": "No sprint created yet.",
  "projects.sprints.pick": "Select a sprint on the left.",
  "projects.sprints.editTooltip": "Edit",
  "projects.sprints.deleteTooltip": "Delete sprint",
  "projects.sprints.deleteConfirm": "Delete sprint “{name}”?",
  "projects.card.due": "Due: {date}",
  "projects.card.subIssues": "{n} sub-issues",
  "projects.card.unassigned": "Unassigned",
  "projects.card.pointsTooltip": "{n} story points",
  "projects.crumb.projects": "Projects",
  "projects.empty.pickSidebar": "Select a project on the left.",
  "projects.loadingInline": "loading…",
  "projects.issueRow.placeholder":
    "What needs doing? Enter to create, Esc to cancel.",
  "projects.count.issuesShown": "{filtered} / {total} issues",
  "projects.link.planeHubTitle": "Plane hub (workspace shortcuts)",
  "projects.openPlaneTooltip": "Open in Plane",
  "projects.reloadTooltip": "Reload",
  "projects.starTooltip": "Favorite",
  "projects.button.newIssue": "Issue",
  "projects.prompt.newProjectName": "New project name:",
  "projects.prompt.projectKey": "Short key (uppercase, max 5 chars — optional):",
  "projects.alert.createProject": "Could not create project: ",
  "projects.alert.createIssue": "Could not create issue: ",
  "projects.alert.saveIssue": "Could not save: ",
  "projects.alert.deleteIssueConfirm": "Delete this issue?",
  "projects.alert.deleteIssue": "Could not delete: ",
  "projects.alert.cycleAssign": "Could not assign sprint: ",
  "projects.alert.createCycle": "Could not create sprint: ",
  "projects.alert.saveCycle": "Could not save sprint: ",
  "projects.alert.deleteCycle": "Could not delete sprint: ",
  "projects.sidebar.expand": "Show projects",
  "projects.list.filteredEmpty": "No issues match this filter.",
  "projects.filter.priorityLabel": "Priority",
  "projects.filter.assigneeLabel": "Assignee",
  "projects.filter.labelsHeading": "Labels",
  "projects.filter.reset": "Reset filters",
  "projects.searchIssues": "Search…",
  "projects.issueDrawer.closeTooltip": "Close",
  "projects.issueDrawer.descriptionSection": "Description",
  "projects.issueDrawer.descriptionPlaceholder": "Add a description…",
  "projects.issueDrawer.issueTypeLabel": "Issue type",
  "projects.issueDrawer.selectPlaceholder": "— Select —",
  "projects.issueDrawer.priorityLabel": "Priority",
  "projects.issueDrawer.assigneesLabel": "Assignees",
  "projects.issueDrawer.sprintLabel": "Sprint",
  "projects.issueDrawer.backlogOption": "— Backlog —",
  "projects.issueDrawer.sprintActiveBadge": "· Active",
  "projects.issueDrawer.sprintPlannedBadge": "· Planned",
  "projects.issueDrawer.sprintEndsPrefix": "Ends",
  "projects.issueDrawer.parentIssueLabel": "Parent issue",
  "projects.issueDrawer.noParentOption": "— None —",
  "projects.issueDrawer.storyPointsLabel": "Story points",
  "projects.issueDrawer.startLabel": "Start",
  "projects.issueDrawer.dueLabel": "Due",
  "projects.issueDrawer.createdPrefix": "Created",
  "projects.issueDrawer.updatedPrefix": "Updated",
  "projects.issueDrawer.completedPrefix": "Completed",
  "projects.issueDrawer.deleteIssue": "Delete issue",
  "projects.issueDrawer.subtasksTitle": "Sub-tasks",
  "projects.issueDrawer.subtasksWithCount": "Sub-tasks ({count})",
  "projects.issueDrawer.addSubtask": "Add sub-task",
  "projects.issueDrawer.subtaskPlaceholder": "Sub-task…",
  "projects.issueDrawer.createButton": "Create",
  "projects.issueDrawer.addAnotherSubtask": "Add another sub-task",
  "projects.issueDrawer.activityTitle": "Activity",
  "projects.issueDrawer.activityWithCount": "Activity ({count})",
  "projects.issueDrawer.loading": "Loading…",
  "projects.issueDrawer.unknownAuthor": "Unknown",
  "projects.issueDrawer.commentFailedPrefix": "Comment failed: ",
  "projects.issueDrawer.commentPlaceholder":
    "Write a comment… (Ctrl/⌘+Enter to send)",
  "projects.issueDrawer.sendButton": "Send",
  "projects.backlog.selectedCount": "{count} selected",
  "projects.backlog.moveToSprint": "Move to sprint…",
  "projects.backlog.move": "Move",
  "projects.backlog.clearSelection": "Clear selection",
  "projects.backlog.startSprintConfirm":
    'Start sprint "{name}"? The start date will be set to today.',
  "projects.backlog.completeSprintConfirm": 'Complete sprint "{name}"?',
  "projects.backlog.startSprintTooltip": "Start sprint",
  "projects.backlog.startSprint": "Start sprint",
  "projects.backlog.completeSprintTooltip": "Complete sprint",
  "projects.backlog.complete": "Complete",
  "projects.backlog.newIssueTooltip": "New issue",
  "projects.backlog.emptyBacklog": "Backlog is empty.",
  "projects.backlog.emptySprint":
    "Sprint is empty — move issues from the backlog.",
  "projects.backlog.badgeActive": "Active",
  "projects.backlog.badgePlanned": "Planned",
  "projects.roadmap.title": "Roadmap",
  "projects.roadmap.subtitle": "{count} sprints with a date range",
  "projects.roadmap.weeks": "Weeks",
  "projects.roadmap.months": "Months",
  "projects.roadmap.today": "Today",
  "projects.roadmap.todayTooltip": "Today",
  "projects.roadmap.sprintColumn": "Sprint",
  "projects.roadmap.empty": "No sprints with start and end dates yet.",
  "projects.roadmap.weekLabel": "W{n}",
  "projects.roadmap.resizeEndTooltip": "Shift end date",

  "files.upload": "Upload",
  "files.newFolder": "New folder",
  "files.newDocument": "New document",
  "files.newSpreadsheet": "New spreadsheet",
  "files.newPresentation": "New presentation",
  "files.newNote": "New note",
  "files.empty": "This folder is empty.",
  "files.title": "File station",
  "files.myDrive": "My Drive",
  "files.subtitle": "{workspace} · stored in the cloud",
  "files.search.here": "Search in folder…",
  "files.search.everywhere": "Search workspace…",
  "files.search.titleHere": "Search this folder only",
  "files.search.titleEverywhere": "Search entire workspace (all folders)",
  "files.allFolders": "all folders",
  "files.newTooltip": "Create new file or folder",
  "files.plusNew": "New",
  "files.menu.doc": "Document (.docx)",
  "files.menu.docHint": "Word-compatible",
  "files.menu.sheet": "Spreadsheet (.xlsx)",
  "files.menu.sheetHint": "Excel-compatible",
  "files.menu.slides": "Presentation (.pptx)",
  "files.menu.slidesHint": "PowerPoint-compatible",
  "files.menu.note": "Note (.md)",
  "files.menu.noteHint": "Markdown",
  "files.menu.folder": "Folder",
  "files.menu.folderHint": "in current directory",
  "files.menu.uploadHint": "from this device",
  "files.upload.tooltip": "Upload files",
  "files.reload": "Reload",
  "files.detail.toggleHide": "Hide details pane",
  "files.detail.toggleShow": "Show details pane",
  "files.prompt.newFile": "New file name:",
  "files.prompt.newFolder": "New folder name:",
  "files.alert.mkdir": "Could not create folder: ",
  "files.alert.delete": "Could not delete: ",
  "files.alert.createDoc": "Could not create: ",
  "files.alert.uploadPrefix": "Upload errors:\n",
  "files.confirm.delete": "Delete “{name}”?",
  "files.alert.presentationId":
    "Presentation created; file ID not available yet — reload the folder and open the file.",
  "files.search.minChars": "Type at least 2 characters for workspace-wide search.",
  "files.search.running": "Searching…",
  "files.search.none": "No matches for “{q}”.",
  "files.search.error": "Search failed: {error}",
  "files.column.name": "Name",
  "files.column.modified": "Modified",
  "files.column.size": "Size",
  "files.detail.pick": "Select a file or folder to see details.",
  "files.kind.folder": "Folder",
  "files.kind.file": "File",
  "files.path": "Path",
  "files.download": "Download",
  "files.openInFolder": "Open in folder “{path}”",
  "files.open.folder": "Open",
  "files.open.portalEditor": "Open in editor",
  "files.open.presentationEditor": "Open in Collabora",
  "files.open.preview": "Preview",

  "marketing.title": "Marketing",
  "marketing.subtitleMautic": "Mautic",
  "marketing.settingsTooltip": "Settings",
  "marketing.openMauticTooltip": "Open in Mautic",
  "marketing.section.overview": "Overview",
  "marketing.section.contacts": "Contacts",
  "marketing.section.segments": "Segments",
  "marketing.section.campaigns": "Campaigns",
  "marketing.section.emails": "Emails",
  "marketing.kpi.contacts": "Contacts",
  "marketing.kpi.active7d": "Active 7d",
  "marketing.kpi.segments": "Segments",
  "marketing.kpi.campaigns": "Campaigns",
  "marketing.kpi.campaignActiveSuffix": "active",
  "marketing.visibleCount": "{count} visible",
  "marketing.reloadTooltip": "Reload",
  "marketing.searchPlaceholder": "Search…",
  "marketing.notConfiguredBanner": "Mautic is not set up yet.",
  "marketing.notConfiguredDetailTitle": "Mautic is not ready yet",
  "marketing.setup.openUi": "Open Mautic UI:",
  "marketing.setup.adminUser":
    "Create the initial admin (database connection is already configured via Compose).",
  "marketing.setup.apiSettings":
    "Settings → Configuration → API Settings → enable API + HTTP basic auth.",
  "marketing.setup.portalUser":
    "Settings → Users → new user portal-bridge, Administrator role.",
  "marketing.setup.envKeys":
    "Put username and password token in .env as MAUTIC_API_USERNAME / MAUTIC_API_TOKEN, restart the stack.",
  "marketing.pickRecordTitle": "Select an item",
  "marketing.pickRecordHint":
    "Designer/builder features (email designer, campaign editor, forms) open in Mautic — click ↗ top right.",
  "marketing.contactFallback": "Contact #{id}",
  "marketing.overview.loading": "Loading…",
  "marketing.overview.setupHint":
    "Mautic still needs setup — see instructions on the right.",
  "marketing.overview.noData": "No data.",
  "marketing.tile.activeCampaigns": "Active campaigns",
  "marketing.tile.emailsPublished": "Emails published",
  "marketing.tile.sendsTotal": "Total sends",
  "marketing.tile.sendsHint": "Sum of sentCount across emails",
  "marketing.tile.segments": "Segments",
  "marketing.openMauticUi": "Open Mautic UI",
  "marketing.detail.overviewTitle": "Marketing overview",
  "marketing.detail.overviewSubtitle": "Mautic",
  "marketing.noOverview": "No overview available.",
  "marketing.bigKpi.contactsSub": "{recent} active 7d",
  "marketing.bigKpi.segmentsSub": "Lists",
  "marketing.bigKpi.campaignsSub": "{total} total",
  "marketing.bigKpi.emailsSub": "{total} total",
  "marketing.bigKpi.sentSub": "Sent",
  "marketing.bigKpi.sentHint": "Sum across all emails",
  "marketing.nextStepsTitle": "Next steps",
  "marketing.nextSteps.crmSegments":
    "Link Twenty CRM pipeline stages with Mautic segments.",
  "marketing.nextSteps.drip":
    "Create a 3-step drip in Mautic (welcome → use case → demo).",
  "marketing.nextSteps.smtp":
    "Configure SMTP sender (e.g. Migadu) in the Mautic mail channel.",
  "marketing.nextSteps.form":
    "Embed a form on the landing page → submissions land in Mautic contacts.",
  "marketing.crm.openInTwenty": "Open in Twenty ({workspace})",
  "marketing.crm.searching": "Searching CRM…",
  "marketing.crm.noPersonForEmail":
    "No matching CRM person for {email}.",
  "marketing.crm.unnamedPerson": "(no name)",
  "marketing.sidebar.crm": "CRM",
  "marketing.sidebar.properties": "Properties",
  "marketing.sidebar.tags": "Tags",
  "marketing.contact.fieldsHeading": "Contact details",
  "marketing.contact.pointsLabel": "Points",
  "marketing.contact.stageLabel": "Stage",
  "marketing.email.createdLabel": "Created",
  "marketing.email.typeLabel": "Type",
  "marketing.detail.openInMautic": "in Mautic",
  "marketing.activity.last": "Last activity",
  "marketing.segment.noDescription": "No description.",
  "marketing.segment.statusPublished": "published",
  "marketing.segment.statusDraft": "draft",
  "marketing.campaign.activatedToast":
    "Campaign activated. Mautic will move contacts through the flow.",
  "marketing.campaign.pausedToast":
    "Campaign paused. Contacts stay where they are; new triggers are ignored.",
  "marketing.campaign.cloneFull":
    "Copy created — flow and audience copied; status: draft.",
  "marketing.campaign.cloneMeta":
    "Copy created (metadata only) — this Mautic API version does not copy events. Rebuild steps in the builder.",
  "marketing.campaign.startHint":
    "Start campaign — Mautic pushes contacts through the flow.",
  "marketing.campaign.pauseTooltip":
    "Pause campaign — new triggers are ignored.",
  "marketing.campaign.pause": "Pause",
  "marketing.campaign.start": "Start",
  "marketing.campaign.duplicateTooltip":
    "Duplicate as a paused draft — audience and flow are copied.",
  "marketing.campaign.duplicate": "Duplicate",
  "marketing.campaign.editor": "Editor",
  "marketing.campaign.noCategory": "No category",
  "marketing.builderHint":
    "Mautic builder. Start, pause and duplicate run from the portal — everything else is in the editor (“Open in Mautic”).",
  "marketing.email.designerInMautic": "Designer in Mautic",
  "marketing.email.opened": "Opened",
  "marketing.email.openRate": "Open rate",
  "marketing.email.statusPublished": "published",

  "office.openIn": "Open in …",
  "office.tagline":
    "{workspace} · Word & Excel in the portal; slides in the OpenOffice editor (Nextcloud)",
  "office.search.placeholder": "Search documents…",
  "office.upload": "Upload",
  "office.reload": "Reload",
  "office.crmContext": "CRM context active",
  "office.link.companyHub": "Company hub",
  "office.link.sign": "Send document for signature (Sign)",
  "office.section.new": "New document",
  "office.hint.portalEditor": "New → portal editor (not Nextcloud)",
  "office.compat.word": "Word-compatible (.docx)",
  "office.compat.excel": "Excel-compatible (.xlsx)",
  "office.compat.ppt": "PowerPoint-compatible (.pptx)",
  "office.compat.md": "Markdown file (.md)",
  "office.createTitle": "Create {label} in this workspace",
  "office.proposal.title": "Quote / proposal from CRM",
  "office.proposal.subtitle":
    "Pick a template, choose a company, generate DOCX (same variables as mail merge)",
  "office.proposal.mergeVersionLine":
    "CRM merge v{merge} · Presets v{preset}{suffix}",
  "office.proposal.sectionTemplate": "Template",
  "office.proposal.templatePresets": "Built-in templates",
  "office.proposal.templateCloudDocs": "From cloud (/Documents)",
  "office.proposal.sectionVariables": "Variables",
  "office.proposal.sectionCompany": "Company",
  "office.proposal.loadingCompanies": "Loading companies…",
  "office.proposal.preview": "Preview",
  "office.proposal.downloadDocx": "Download DOCX",
  "office.proposal.tokensFound": "Detected placeholders:",
  "office.proposal.footerMergeZip":
    "Mail merge for many recipients: open the document in the editor → mail merge (ZIP).",
  "office.proposal.cloudFormatsHint":
    "Only .docx, .html under {docs}. In Word use placeholders like {{company.name}}.",
  "office.proposal.loadingTemplateFile": "Loading template…",
  "office.proposal.loadingDocList": "Loading list…",
  "office.proposal.noTemplatesInFolder":
    "No matching files. Add e.g. Quote.docx to {docs}.",
  "office.proposal.activeTemplate": "Active:",
  "office.proposal.conversionNote": "Conversion note:",
  "office.proposal.error.pickCompany": "Please select a company.",
  "office.proposal.error.pickCloudTemplate":
    "Please pick a template from /Documents.",
  "office.proposal.error.noPresetTemplate": "No template.",
  "office.recents": "Recently changed in {dir}",
  "office.empty": "No office files yet. Create one above or upload.",
  "office.prompt.filename": "New file name:",
  "office.alert.create": "Could not create: ",
  "office.alert.upload": "Upload errors:\n",
  "office.alert.presentationId":
    "Presentation created, but Nextcloud has no file ID yet. Refresh the list and try again.",
};

const DICT: Record<Locale, Messages> = { de, en };

/** Resolve a locale from any input string (e.g. `navigator.language`). */
export function detectLocale(input: string | undefined | null): Locale {
  if (!input) return DEFAULT_LOCALE;
  const head = input.toLowerCase().slice(0, 2);
  return (SUPPORTED_LOCALES as string[]).includes(head)
    ? (head as Locale)
    : DEFAULT_LOCALE;
}

/** BCP 47 tag for `Intl` formatters (dashboard, pulse timestamps). */
export function localeTag(locale: Locale): string {
  // en-GB rather than en-US so that toLocaleTimeString() defaults to 24-hour
  // (no AM/PM) and toLocaleDateString() defaults to dd/mm/yyyy. This matches
  // every other Swiss-Ops timestamp in the portal and avoids surprising the
  // user with US-formatted "11:48 PM" sprinkled into an otherwise 24h UI.
  return locale === "en" ? "en-GB" : "de-DE";
}

export function tFor(
  locale: Locale,
  key: keyof Messages,
  fallback?: string,
): string {
  const dict = DICT[locale] ?? DICT[DEFAULT_LOCALE];
  return dict[key] ?? DICT[DEFAULT_LOCALE][key] ?? fallback ?? String(key);
}

export { DICT };

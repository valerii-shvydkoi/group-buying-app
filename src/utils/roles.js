const ROLE_LABELS = Object.freeze({
  participant: 'Учасник',
  organizer: 'Організатор',
  courier: 'Кур’єр',
})

export function getRoleLabel(role) {
  return ROLE_LABELS[role] || ROLE_LABELS.participant
}

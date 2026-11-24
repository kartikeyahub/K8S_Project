{{- define "item-service.fullname" -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end }}

{{- define "item-service.selectorLabels" -}}
app.kubernetes.io/name: item-service
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "item-service.labels" -}}
{{ include "item-service.selectorLabels" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
environment: {{ .Values.environment | default "unknown" | quote }}
{{- end }}

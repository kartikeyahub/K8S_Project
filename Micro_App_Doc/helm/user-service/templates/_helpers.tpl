{{- define "user-service.fullname" -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end }}

{{- define "user-service.selectorLabels" -}}
app.kubernetes.io/name: user-service
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "user-service.labels" -}}
{{ include "user-service.selectorLabels" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
environment: {{ .Values.environment | default "unknown" | quote }}
{{- end }}

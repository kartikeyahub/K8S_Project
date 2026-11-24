{{- define "external-postgres.fullname" -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end }}

{{- define "external-postgres.labels" -}}
app.kubernetes.io/name: external-postgres
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
environment: {{ .Values.environment | quote }}
{{- end }}

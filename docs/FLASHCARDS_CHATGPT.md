# Flashcards do ChatGPT → AUVRYN

O AUVRYN 1.1 aceita flashcards em JSON, CSV ou texto simples.

## Método recomendado — JSON

Peça ao ChatGPT:

> Crie flashcards sobre [TEMA]. Responda SOMENTE com JSON válido no formato abaixo, sem markdown e sem comentários: [{"front":"pergunta curta","back":"resposta curta","tags":"tema"}]

Exemplo:

```json
[
  {
    "front": "Qual é o achado clássico da fibrilação atrial no ECG?",
    "back": "Ritmo irregularmente irregular e ausência de ondas P organizadas.",
    "tags": "Arritmias"
  },
  {
    "front": "O que caracteriza um bloqueio AV de 1º grau?",
    "back": "Intervalo PR prolongado e constante, com condução 1:1.",
    "tags": "Arritmias"
  }
]
```

No AUVRYN:
1. Faculdade → Flashcards.
2. Clique em **Importar do ChatGPT**.
3. Dê um nome ao baralho.
4. Cole o JSON ou selecione o arquivo.
5. Clique em importar.

## Texto simples

Também funciona uma linha por cartão:

```text
Pergunta 1 | Resposta 1
Pergunta 2 | Resposta 2
```

Separadores aceitos incluem `|`, tabulação e `::`.

## CSV

Um CSV simples com frente e verso também pode ser usado. Para menor chance de conflito com vírgulas dentro do conteúdo, prefira JSON.

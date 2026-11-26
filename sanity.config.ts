import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import {schemaTypes} from './schemaTypes'

export default defineConfig({
  name: 'default',
  title: 'Glorion Media',

  projectId: 'b57pzymc',
  dataset: 'production',
  deployment: {
    appId: 'heul13kby5rlmzaw5z0bi8v6',
  },

  plugins: [structureTool(), visionTool()],

  form: {
    components: {
      portableText: {
        plugins: (props) => {
          return props.renderDefault({
            ...props,
            plugins: {
              ...props.plugins,
              table: {enabled: true},
            },
          })
        },
      },
    },
  },

  schema: {
    types: schemaTypes,
  },
})

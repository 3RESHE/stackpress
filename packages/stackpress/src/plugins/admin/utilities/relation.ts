//modules
import mustache from 'mustache';
//stackpress
import type { 
  MouseEvent, 
  KeyboardEvent, 
  AttributeChangeEvent 
} from '@stackpress/ink/dist/types';
import type ClientComponent from '@stackpress/ink/dist/client/Component';
import ClientRegistry from '@stackpress/ink/dist/client/Registry';
import signal from '@stackpress/ink/dist/client/api/signal';

export type State = {
  show: boolean,
  query: string,
  values: string[],
  options: Node[],
  filtered: Node[],
  selected: Node[]
};

export function makeOptions(children: Node[]) {
  return Array.from(children)
    //only HTML elements
    .filter(option => option instanceof HTMLElement)
    //filter out hidden inputs
    .filter(option => option.nodeName !== 'INPUT' 
      || !option.hasAttribute('type')
      || option.getAttribute('type') !== 'hidden'
    )
    //filter out options with slot attributes that are not filtered
    .filter(option => !option.hasAttribute('slot') 
      || option.getAttribute('slot') === 'filtered'
    )
    //build options markup
    .map(option => {
      //if not an option, return the option as is
      if (option.nodeName !== 'OPTION') {
        return option;
      }
      //get the attributes
      const attributes = ClientRegistry.get(option)?.attributes || {};
      //set value if not set
      attributes.value = attributes.value ? attributes.value 
        : option.hasAttribute('value') ? option.getAttribute('value')
        : option.innerText.trim();
      //set class if not set (this is for shadow styles)
      attributes['class'] = attributes['class'] ? attributes['class']
        : option.hasAttribute('class') ? option.getAttribute('class')
        : 'select-default-option';
      //get the children
      const children = Array.from(option.childNodes);
      //create and return the option wrapper
      return ClientRegistry.createElement('div', attributes, children).element;
    });
}

export function getHandlers(
  host: ClientComponent, 
  options: Element[],
  slot = true
) {
  const {  
    value, multiple, open,
    close, filter,   select, 
    clear, change,   update,
    href,  foreign,  template,
    key
  } = host.props;

  let active = 0; 

  const handlers = {
    toggle: (e: MouseEvent<HTMLElement>) => {
      const show = !state.value.show;
      state.value = { ...state.value, show };
      show ? open && open(e, state) : close && close(e, state);
    },
    select: (e: MouseEvent<HTMLElement>) => {
      //get selected choice
      const option = e.currentTarget as HTMLElement;
      //get selected value
      const value = ClientRegistry.get(option)?.getAttribute('value');
      //if value is undefined, skip (or throw error)
      if (typeof value === 'undefined') return;
      //remake state
      state.value = handlers.make(
        //same options
        state.value.options,
        //change values
        state.value.values.includes(value)
          ? state.value.values.filter((v: any) => v !== value)
          : multiple 
          ? [ ...state.value.values, value ]
          : [ value ],
        //same keyword
        state.value.query,
        //close dropdown
        multiple ? state.value.show : false
      );
      //trigger all events
      select && select(e, state);
      change && change({ ...e, target: { 
        ...host, 
        value: multiple ? state.value.values : value
      }});
      update && update(multiple ? state.value.values : value);
    },
    filter: (e: KeyboardEvent<HTMLInputElement>) => {
      const target = e.target as HTMLInputElement;
      //next tick
      setTimeout(() => {
        //get the selection range
        const selection = [ target.selectionStart, target.selectionEnd ];
        //get the value from the search input
        const query = target.value.toLowerCase();
        //query
        const id = ++active;
        fetch(`${href}?q=${query}&json`).then(response => {
          return response.json()
        }).then(response => {
          if (id !== active) return;
          const options = response.results?.map((row: Record<string, any>) => {
            const option = document.createElement('option');
            option.textContent = mustache.render(template || '', row);
            const element = ClientRegistry.register(option);
            element.setAttribute('value', row[foreign]);
            return option;
          }) || [];
          //remake state
          state.value = handlers.make(
            //new options
            makeOptions(options),
            //same values
            state.value.values,
            //change query
            query,
            //same dropdown state
            state.value.show
          );

          //a re-render just happened? so we need
          //to re-focus the input to continue typing
          const input = host.shadowRoot?.querySelector('.input') as HTMLInputElement|null;
          input?.focus();
          input?.setSelectionRange(selection[0], selection[1]);

          filter && filter(e)
        });
      }, 1);
    },
    fetch: () => {
      //query
      const id = ++active;
      fetch(`${href}?filter[${key}]=${value}&take=1&json`).then(response => {
        return response.json()
      }).then(response => {
        if (id !== active) return;
        const options = response.results?.map((row: Record<string, any>) => {
          const option = document.createElement('option');
          option.textContent = mustache.render(template || '', row);
          const element = ClientRegistry.register(option);
          element.setAttribute('value', row[foreign]);
          return option;
        }) || [];
        //remake state
        state.value = handlers.make(
          //new options
          makeOptions(options),
          //same values
          state.value.values,
          //change query
          '',
          //same dropdown state
          state.value.show
        );
      });
    },
    clear: (e: MouseEvent<HTMLElement>) => {
      //make new state with no values
      state.value = handlers.make(
        //same options
        state.value.options,
        //no values
        [],
        //same keyword
        state.value.query,
        //close dropdown
        false
      );
      clear && clear(e, state);
      change && change({ ...e, target: { 
        ...host, 
        value: multiple ? [] : null
      }});
      update && update(multiple ? [] : null);
    },
    over: (e: MouseEvent<HTMLElement>) => {
      e.stopPropagation();
      local.over = true;
      return false;
    },
    out: (e: MouseEvent<HTMLElement>) => {
      e.stopPropagation();
      local.over = false;
      if (!state.value.show) {
        return false;
      }
      setTimeout(() => {
        if (!local.over && state.value.show) {
          state.value = { ...state.value, show: false };
          close && close(e, state);
        }
      }, 500);
      return false;
    },
    make: (
      options: Node[], 
      value: string|string[],
      query = '', 
      show = false
    ) => {
      //determine values
      const values = (Array.isArray(value) 
        ? Array.from(value) 
        : [ value ]
      ).filter(Boolean);
      //safe bind...
      options.forEach(option => {
        if (!(option instanceof HTMLElement)) return;
        //listen to click
        const select = handlers.select as unknown as EventListener;
        option.removeEventListener('click', select);
        option.addEventListener('click', select);
        //set value
        const element = ClientRegistry.get(option);
        if (element) {
          if (!element.hasAttribute('value')) {
            element.setAttribute('value', option.innerText.trim());
          }
        }
      });
      //filter options by keyword
      const filtered = options.map(option => {
        if (slot && option instanceof Element) {
          option.setAttribute('slot', 'filtered');
        }
        return option;
      });
      //filter options by values
      const selected = options.filter(option => {
        //if not an element, skip
        if (!(option instanceof Element)) return false;
        //get the element from the registry
        const element = ClientRegistry.get(option);
        //if no element, skip
        if (!element) return false;
        //now get the value attribute
        const value = element.getAttribute('value');
        //if no value, skip
        if (!value) return false;
        //return true if value is in values
        return values.includes(value);
      }).map(option => {
        const clone = option.cloneNode(true);
        if (slot && clone instanceof Element) {
          clone.setAttribute('slot', 'selected');
        }
        return clone;
      });
      
      return { show, query, values, options, filtered, selected };
    },
    attribute(e: AttributeChangeEvent) {
      //accepts: name, value
      const { action, name, value, target } = e.detail;
      const inputs = Array.from(
        target.querySelectorAll(':scope > input[hidden]')
      );
      for (let i = 0; i < inputs.length; i++) {
        const input = inputs[i];
        if (name === 'name') {
          switch (action) {
            case 'add':
            case 'update':
              input.setAttribute('name', value);
              break;
            case 'remove':
              input.removeAttribute('name');
              break;
          }
        } else if (name === 'value') { 
          const values = Array.isArray(value) ? value : [ value ]; 
          if (action === 'remove' 
            || typeof values[i] === 'undefined' 
            || values[i] === null
          ) {
            input.removeAttribute(name);
            continue;
          }
          input.setAttribute(name, values[i]);
        }
      }
    }
  };

  //get initial state (show, values, options, selected)
  const state = signal<State>(handlers.make(options, value), host);
  //local state
  const local = { over: false };
  //default listeners
  const over = handlers.over as unknown as EventListener;
  const out = handlers.out as unknown as EventListener;
  host.addEventListener('mouseover', over);
  host.addEventListener('mouseout', out);
  host.on('attributechange', handlers.attribute);
  if (value && key) {
    handlers.fetch();
  }
  return { state, local, ...handlers };
};
